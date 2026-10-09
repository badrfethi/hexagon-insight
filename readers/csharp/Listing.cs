using System.Diagnostics;
using System.Text.RegularExpressions;

namespace HexagonInsight.CSharp;

/** The files git knows about, as the TypeScript reader lists them (`../typescript/files.ts`). */
internal static partial class Listing
{
    /**
     * What counts as code, and so as something the map must account for: C#, and the pages,
     * scripts and features a C# repository carries beside it. Project files, JSON, SQL and Markdown
     * are configuration and data, not code with a shape worth drawing.
     */
    [GeneratedRegex(@"\.(?:cs|ts|mts|cts|js|mjs|cjs|html|feature)$")]
    private static partial Regex Code();

    /**
     * Every code file git lists, relative to the root: tracked, and untracked but not ignored, so a
     * file written a minute ago is on the map and `bin/` and `obj/` are not.
     */
    public static IReadOnlyList<string> CodeFiles(string root)
    {
        ProcessStartInfo start = new("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
        {
            WorkingDirectory = root,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        using Process git = Process.Start(start)
            ?? throw new ReadFailure("git could not be started, and the C# reader lists files with it");
        string listed = git.StandardOutput.ReadToEnd();
        string error = git.StandardError.ReadToEnd();

        git.WaitForExit();

        if (git.ExitCode != 0)
        {
            throw new ReadFailure($"git could not list the target's files: {error.Trim()}");
        }

        return [.. listed.Split('\0').Where(path => Code().IsMatch(path)).Distinct().Order(StringComparer.Ordinal)];
    }
}
