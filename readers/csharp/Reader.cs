using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.MSBuild;

namespace HexagonInsight.CSharp;

/**
 * What the C# reader reads from a target's code (`analysis/model.ts`, `Code`): every project its
 * solution loads, and the code files git lists.
 *
 * Everything C#-shaped about the target is decided here and nowhere in the hexagon part: that a
 * project with `<OutputType>Exe</OutputType>` under `src/` wires the application, so its files are
 * the composition roots and its folder is claimed beside the hexagon's; that every file of a test
 * project is test code; that `bin/` and `obj/` are build output, not the target's code; what a
 * Reqnroll suite builds for every scenario and which steps go with which feature (`Worlds`); and
 * what a type's facts are, read through Roslyn's semantic model:
 *
 * - **imports**: the target's own types a file names, each once, in the order first named — C#
 *   imports namespaces, so the names a file uses are what TypeScript's named imports are. A type
 *   is also named by a constructor it calls, or by an extension method it calls on something else.
 * - **constructs**: the types a `new` builds, target-typed `new()` included.
 * - **implements**: the interfaces in a class's or struct's base list, with the name as written.
 * - **externals**: the assemblies outside the target that a file's names resolve into, by
 *   assembly name, or by shared framework for a framework's own (`Microsoft.AspNetCore.App`). The
 *   base framework, `Microsoft.NETCore.App`, is every file's, and not listed.
 * - **exported**: `public`, so a type in another project can use it.
 *
 * Code that does not compile is read as far as Roslyn binds it: the facts of a name it cannot
 * resolve are missing, and nothing fails. Only a solution or a project that will not load does.
 */
internal static partial class Reader
{
    public static async Task<Code> ReadAsync(string root, string solutionPath)
    {
        Solution solution = await OpenAsync(solutionPath).ConfigureAwait(false);
        HashSet<string> listed = [.. Listing.CodeFiles(root)];
        List<Source> sources = [];
        HashSet<string> exes = [];

        foreach (Project project in OwnProjects(root, solution))
        {
            Compilation compilation = await project.GetCompilationAsync().ConfigureAwait(false)
                ?? throw new ReadFailure($"Roslyn could not compile {Relative(root, project.FilePath!)}");
            bool test = IsTestProject(project, compilation);
            string folder = Relative(root, Path.GetDirectoryName(project.FilePath!)!);

            if (IsExe(project) && folder.StartsWith("src/", StringComparison.Ordinal))
            {
                exes.Add(folder);
            }

            foreach (Document document in project.Documents)
            {
                string? path = OwnPath(root, document.FilePath);
                SyntaxTree? tree = await document.GetSyntaxTreeAsync().ConfigureAwait(false);

                if (path is not null && tree is not null && sources.TrueForAll(source => source.Path != path))
                {
                    sources.Add(new Source(path, tree, compilation.GetSemanticModel(tree), test, folder));
                }
            }
        }

        Registry registry = new(sources);
        Dictionary<string, CodeFile> files = [];

        foreach (Source source in sources)
        {
            files[source.Path] = CompiledFile(registry, source, listed.Contains(source.Path));
        }

        foreach (string path in listed.Where(path => !files.ContainsKey(path)))
        {
            files[path] = PlainFile(root, path);
        }

        return new Code(
            [.. files.Values.OrderBy(file => file.Path, StringComparer.Ordinal)],
            [.. registry.All.OrderBy(declaration => declaration.Id, StringComparer.Ordinal)],
            [.. sources.Where(source => exes.Contains(source.Project)).Select(source => source.Path).Order(StringComparer.Ordinal)],
            Worlds.StepsPairs(sources, listed),
            [.. exes.Where(IsClaimable).Order(StringComparer.Ordinal)]);
    }

    /** A file of a project the solution loads, with the semantic model that binds its names. */
    internal sealed record Source(string Path, SyntaxTree Tree, SemanticModel Model, bool Test, string Project);

    /**
     * The solution, with every project it lists and every project those reference, loaded as
     * MSBuild evaluates it. A project that fails to load is a read failure, naming what MSBuild said:
     * a project left out would draw half a target as if it were all of it.
     */
    private static async Task<Solution> OpenAsync(string solutionPath)
    {
        await RestoreAsync(solutionPath).ConfigureAwait(false);

        MSBuildWorkspace workspace = MSBuildWorkspace.Create();
        List<string> failures = [];

        using IDisposable handler = workspace.RegisterWorkspaceFailedHandler(failed =>
        {
            if (failed.Diagnostic.Kind == WorkspaceDiagnosticKind.Failure)
            {
                failures.Add(failed.Diagnostic.Message);
            }
        });

        Solution solution;

        try
        {
            solution = await workspace.OpenSolutionAsync(solutionPath).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is InvalidOperationException or IOException or InvalidDataException)
        {
            throw new ReadFailure($"Roslyn could not open {Path.GetFileName(solutionPath)}: {exception.Message}");
        }

        if (failures.Count > 0)
        {
            throw new ReadFailure(
                $"Roslyn could not load every project of {Path.GetFileName(solutionPath)}:\n" +
                string.Join("\n", failures.Distinct()));
        }

        return solution;
    }

    /**
     * `dotnet restore` over the solution, which writes each project's `obj/`, as a build does.
     * Without it MSBuild resolves no package and passes on no project reference a project only
     * reaches through another, so Roslyn binds too few names, and the facts would be wrong without
     * saying so. A solution restored already is a no-op of seconds; one that cannot be restored, such
     * as with packages not cached and no network, is a read failure.
     */
    private static async Task RestoreAsync(string solutionPath)
    {
        ProcessStartInfo start = new("dotnet", ["restore", solutionPath, "-nologo", "-v", "q"])
        {
            WorkingDirectory = Path.GetDirectoryName(solutionPath)!,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        using Process dotnet = Process.Start(start)
            ?? throw new ReadFailure("dotnet could not be started to restore the solution");
        Task<string> output = dotnet.StandardOutput.ReadToEndAsync();
        Task<string> error = dotnet.StandardError.ReadToEndAsync();

        await dotnet.WaitForExitAsync().ConfigureAwait(false);

        if (dotnet.ExitCode != 0)
        {
            throw new ReadFailure(
                $"dotnet restore failed for {Path.GetFileName(solutionPath)}, and without it the code " +
                $"cannot be read whole:\n{(await output.ConfigureAwait(false) + await error.ConfigureAwait(false)).Trim()}");
        }
    }

    /** The solution's projects inside the root, each once: a project built for two frameworks loads twice. */
    private static IEnumerable<Project> OwnProjects(string root, Solution solution) =>
        solution.Projects
            .Where(project => project.FilePath is not null && OwnPath(root, project.FilePath) is not null)
            .DistinctBy(project => project.FilePath, StringComparer.OrdinalIgnoreCase)
            .OrderBy(project => project.FilePath, StringComparer.Ordinal);

    private static bool IsExe(Project project) =>
        project.CompilationOptions?.OutputKind is OutputKind.ConsoleApplication or OutputKind.WindowsApplication;

    /** A folder the layout rule lets stand beside the hexagon's: one directly in `src` or `src/infrastructure`. */
    private static bool IsClaimable(string folder)
    {
        string parent = folder[..Math.Max(folder.LastIndexOf('/'), 0)];

        return parent is "src" or "src/infrastructure";
    }

    /**
     * A test project, as `dotnet test` tells one: it says `IsTestProject`, or it references the test
     * SDK, Reqnroll, xUnit, NUnit or MSTest, in its project file or among the assemblies it compiles
     * against.
     */
    private static bool IsTestProject(Project project, Compilation compilation)
    {
        XDocument file = XDocument.Load(project.FilePath!);
        bool says = file.Descendants().Any(element =>
            element.Name.LocalName == "IsTestProject" &&
            string.Equals(element.Value.Trim(), "true", StringComparison.OrdinalIgnoreCase));
        bool references = file.Descendants()
            .Where(element => element.Name.LocalName == "PackageReference")
            .Select(element => (string?)element.Attribute("Include") ?? "")
            .Concat(compilation.ReferencedAssemblyNames.Select(assembly => assembly.Name))
            .Any(name => TestFramework().IsMatch(name));

        return says || references;
    }

    [GeneratedRegex(@"^(?:Microsoft\.NET\.Test\.Sdk|Reqnroll|xunit|nunit|MSTest|Microsoft\.VisualStudio\.TestPlatform\.TestFramework)(?:\.|$)", RegexOptions.IgnoreCase)]
    private static partial Regex TestFramework();

    private static CodeFile CompiledFile(Registry registry, Source source, bool listed)
    {
        SyntaxNode root = source.Tree.GetRoot();
        Facts facts = new(registry, source);

        return new CodeFile(
            source.Path,
            listed,
            Compiled: true,
            source.Test,
            Lines.CodeLinesOf(root),
            facts.Externals,
            facts.Declares,
            facts.Imports,
            facts.ConstructorParameterTypes,
            facts.Constructs,
            [.. facts.Imports.Select(id => registry.Get(id).File).Distinct()]);
    }

    private static CodeFile PlainFile(string root, string path)
    {
        string absolute = Path.Combine(root, path);
        int lines = File.Exists(absolute) ? Lines.CodeLinesIn(absolute) : 0;

        return new CodeFile(path, Listed: true, Compiled: false, Test: false, lines, [], [], [], [], [], []);
    }

    /** `path` relative to the root, with `/`, when it is the target's own: inside it, and not build output. */
    internal static string? OwnPath(string root, string? path)
    {
        if (path is null)
        {
            return null;
        }

        string relative = Relative(root, path);
        string[] segments = relative.Split('/');

        return relative.StartsWith("../", StringComparison.Ordinal) || Path.IsPathRooted(relative) ||
            segments.Any(segment => segment is "bin" or "obj")
            ? null
            : relative;
    }

    internal static string Relative(string root, string path) =>
        Path.GetRelativePath(root, path).Replace('\\', '/');
}
