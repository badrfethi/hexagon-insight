using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace HexagonInsight.CSharp;

/**
 * What a Reqnroll suite builds for every scenario, and which steps belong to which feature.
 *
 * - **A world** is what Reqnroll builds fresh for each scenario: a class of the target's own that a
 *   `[Binding]` class takes in its constructor, which Reqnroll's context injection creates once per
 *   scenario, and a `[Binding]` class with a `[BeforeScenario]` hook. What it builds for every
 *   scenario (`Declaration.buildsPerScenario`) is each class of the target's own it constructs in a
 *   field or property initializer, a constructor, or such a hook; a method called later builds on
 *   demand, not for every scenario.
 * - **A steps file** is paired with `<folder>/<Name>.feature` when it is under `<folder>/support/`
 *   and declares a `[Binding]` class named `<Name>Steps`, as the TypeScript reader pairs
 *   `<folder>/support/<name>.steps.ts`. Steps bound to no feature by name, such as one class per
 *   domain word shared by every feature, pair with none: Reqnroll's bindings are global.
 */
internal static class Worlds
{
    public static HashSet<INamedTypeSymbol> Find(IReadOnlyList<Reader.Source> sources)
    {
        HashSet<INamedTypeSymbol> worlds = new(SymbolEqualityComparer.Default);
        HashSet<SyntaxTree> own = [.. sources.Select(source => source.Tree)];

        foreach (INamedTypeSymbol binding in Bindings(sources))
        {
            if (binding.GetMembers().OfType<IMethodSymbol>().Any(IsBeforeScenario))
            {
                worlds.Add(binding);
            }

            foreach (IParameterSymbol parameter in binding.InstanceConstructors.SelectMany(constructor => constructor.Parameters))
            {
                if (parameter.Type is INamedTypeSymbol { TypeKind: TypeKind.Class } type &&
                    type.OriginalDefinition.DeclaringSyntaxReferences.Any(reference => own.Contains(reference.SyntaxTree)))
                {
                    worlds.Add(type.OriginalDefinition);
                }
            }
        }

        return worlds;
    }

    /** The ids of the target's own classes a world constructs for every scenario, each once, in the order written. */
    public static IReadOnlyList<string> BuiltBy(
        Registry registry,
        IReadOnlyDictionary<SyntaxTree, Reader.Source> sources,
        INamedTypeSymbol world)
    {
        List<string> built = [];

        foreach (SyntaxReference reference in world.DeclaringSyntaxReferences)
        {
            if (!sources.TryGetValue(reference.SyntaxTree, out Reader.Source? source) ||
                reference.GetSyntax() is not TypeDeclarationSyntax type)
            {
                continue;
            }

            foreach (BaseObjectCreationExpressionSyntax creation in PerScenario(source.Model, type)
                .SelectMany(node => node.DescendantNodesAndSelf().OfType<BaseObjectCreationExpressionSyntax>()))
            {
                if (source.Model.GetTypeInfo(creation).Type is INamedTypeSymbol { TypeKind: TypeKind.Class } made &&
                    registry.IdOf(made) is { } id && !built.Contains(id))
                {
                    built.Add(id);
                }
            }
        }

        return built;
    }

    /** Each `<folder>/<Name>.feature` among the listed files, with the steps file under `<folder>/support/` that binds `<Name>Steps`. */
    public static IReadOnlyList<StepsPair> StepsPairs(IReadOnlyList<Reader.Source> sources, IEnumerable<string> listed)
    {
        Dictionary<string, string> stepsFiles = [];

        foreach (Reader.Source source in sources.OrderBy(source => source.Path, StringComparer.Ordinal))
        {
            foreach (TypeDeclarationSyntax type in Facts.TopLevelTypes(source.Tree.GetRoot()))
            {
                if (source.Model.GetDeclaredSymbol(type) is INamedTypeSymbol symbol && IsBinding(symbol) &&
                    symbol.Name.EndsWith("Steps", StringComparison.Ordinal))
                {
                    stepsFiles.TryAdd($"{source.Path}#{symbol.Name}", source.Path);
                }
            }
        }

        List<StepsPair> pairs = [];

        foreach (string feature in listed.Where(path => path.EndsWith(".feature", StringComparison.Ordinal)).Order(StringComparer.Ordinal))
        {
            int slash = feature.LastIndexOf('/');
            string folder = slash < 0 ? "" : feature[..slash];
            string name = Path.GetFileNameWithoutExtension(feature);
            string support = folder.Length == 0 ? "support/" : $"{folder}/support/";
            string? steps = stepsFiles
                .Where(entry => entry.Value.StartsWith(support, StringComparison.Ordinal) &&
                    entry.Key.EndsWith($"#{name}Steps", StringComparison.Ordinal))
                .Select(entry => entry.Value)
                .FirstOrDefault();

            if (steps is not null)
            {
                pairs.Add(new StepsPair(steps, feature));
            }
        }

        return pairs;
    }

    private static IEnumerable<INamedTypeSymbol> Bindings(IReadOnlyList<Reader.Source> sources) =>
        sources
            .Where(source => source.Test)
            .SelectMany(source => Facts.TopLevelTypes(source.Tree.GetRoot())
                .Select(type => source.Model.GetDeclaredSymbol(type))
                .OfType<INamedTypeSymbol>())
            .Where(IsBinding)
            .Distinct<INamedTypeSymbol>(SymbolEqualityComparer.Default);

    /** The parts of a world that run for every scenario: initializers, constructors and `[BeforeScenario]` hooks. */
    private static IEnumerable<SyntaxNode> PerScenario(SemanticModel model, TypeDeclarationSyntax type) =>
        type.Members.SelectMany<MemberDeclarationSyntax, SyntaxNode>(member => member switch
        {
            FieldDeclarationSyntax field => field.Declaration.Variables
                .Where(variable => !field.Modifiers.Any(modifier => modifier.Text is "static" or "const"))
                .SelectMany(variable => variable.Initializer is null ? [] : new SyntaxNode[] { variable.Initializer }),
            PropertyDeclarationSyntax { Initializer: { } initializer } property
                when !property.Modifiers.Any(modifier => modifier.Text == "static") => [initializer],
            ConstructorDeclarationSyntax constructor
                when !constructor.Modifiers.Any(modifier => modifier.Text == "static") => [constructor],
            MethodDeclarationSyntax method when model.GetDeclaredSymbol(method) is IMethodSymbol symbol && IsBeforeScenario(symbol) => [method],
            _ => [],
        });

    private static bool IsBinding(INamedTypeSymbol type) => HasAttribute(type, "BindingAttribute");

    private static bool IsBeforeScenario(IMethodSymbol method) => HasAttribute(method, "BeforeScenarioAttribute");

    /** An attribute of Reqnroll's, by name: a target compiles against one Reqnroll, whatever its version. */
    private static bool HasAttribute(ISymbol symbol, string name) =>
        symbol.GetAttributes().Any(attribute =>
            attribute.AttributeClass is { Name: var found } &&
            found == name &&
            attribute.AttributeClass.ContainingNamespace?.ToDisplayString().StartsWith("Reqnroll", StringComparison.Ordinal) == true);
}
