using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace HexagonInsight.CSharp;

/** One compiled file's facts (`CodeFile` in `analysis/model.ts`), as `Reader` describes them. */
internal sealed partial class Facts
{
    private static readonly Dictionary<IAssemblySymbol, string?> ExternalNames = new(SymbolEqualityComparer.Default);

    public Facts(Registry registry, Reader.Source source)
    {
        SyntaxNode root = source.Tree.GetRoot();
        SemanticModel model = source.Model;
        string? Own(ITypeSymbol? type) => type is null ? null : registry.IdOf(type);

        this.Declares = Distinct(TopLevelTypes(root).Select(type => Own(model.GetDeclaredSymbol(type))));

        List<string?> named = [];
        List<string?> externals = [];

        foreach (SimpleNameSyntax name in root.DescendantNodes().OfType<SimpleNameSyntax>())
        {
            ISymbol? symbol = model.GetSymbolInfo(name).Symbol ?? model.GetSymbolInfo(name).CandidateSymbols.FirstOrDefault();

            named.Add(Own(TypeNamedBy(symbol)));
            externals.Add(symbol is null or INamespaceSymbol ? null : ExternalName(model.Compilation, symbol.ContainingAssembly));
        }

        this.Imports = Distinct(named).Where(id => registry.Get(id).File != source.Path).ToList();
        this.Externals = Distinct(externals);
        this.ConstructorParameterTypes = Distinct(
            ConstructorParameters(root)
                .SelectMany(parameter => parameter.Type?.DescendantNodesAndSelf().OfType<SimpleNameSyntax>() ?? [])
                .Select(name => Own(TypeNamedBy(model.GetSymbolInfo(name).Symbol))));
        this.Constructs = Distinct(
            root.DescendantNodes()
                .OfType<BaseObjectCreationExpressionSyntax>()
                .Select(creation => Own(model.GetTypeInfo(creation).Type)));
    }

    public IReadOnlyList<string> Declares { get; }

    public IReadOnlyList<string> Imports { get; }

    public IReadOnlyList<string> Externals { get; }

    public IReadOnlyList<string> ConstructorParameterTypes { get; }

    public IReadOnlyList<string> Constructs { get; }

    /** The classes, structs, records and interfaces declared directly in a file or its namespaces. */
    public static IEnumerable<TypeDeclarationSyntax> TopLevelTypes(SyntaxNode root) =>
        root.DescendantNodes(node => node is CompilationUnitSyntax or BaseNamespaceDeclarationSyntax)
            .OfType<TypeDeclarationSyntax>()
            .Where(type => type.Parent is CompilationUnitSyntax or BaseNamespaceDeclarationSyntax);

    /** The type a name stands for: the type itself, an alias's, or that of a constructor or extension method it calls. */
    private static ITypeSymbol? TypeNamedBy(ISymbol? symbol) => symbol switch
    {
        ITypeSymbol type => type,
        IAliasSymbol { Target: ITypeSymbol type } => type,
        IMethodSymbol { MethodKind: MethodKind.Constructor } constructor => constructor.ContainingType,
        IMethodSymbol { IsExtensionMethod: true } extension => extension.ContainingType,
        IMethodSymbol { ReducedFrom: not null } reduced => reduced.ContainingType,
        _ => null,
    };

    /** The parameters of every constructor in the file, primary constructors included. */
    private static IEnumerable<ParameterSyntax> ConstructorParameters(SyntaxNode root) =>
        root.DescendantNodes().SelectMany(node => node switch
        {
            ConstructorDeclarationSyntax constructor => constructor.ParameterList.Parameters,
            TypeDeclarationSyntax { ParameterList: { } primary } => primary.Parameters,
            _ => [],
        });

    /**
     * The name an assembly outside the target goes by: its shared framework's, when it is part of
     * one other than the base framework, and its own otherwise. Null for the target's own assemblies
     * and for the base framework, which every file uses.
     */
    private static string? ExternalName(Compilation compilation, IAssemblySymbol? assembly)
    {
        if (assembly is null || assembly.Locations.Any(location => location.IsInSource))
        {
            return null;
        }

        if (ExternalNames.TryGetValue(assembly, out string? known))
        {
            return known;
        }

        string? path = (compilation.GetMetadataReference(assembly) as PortableExecutableReference)?.FilePath;
        Match framework = path is null ? Match.Empty : SharedFramework().Match(path);
        string? name = framework.Success ? framework.Groups[1].Value : assembly.Name;

        if (name is "Microsoft.NETCore.App" or "netstandard" or "mscorlib")
        {
            name = null;
        }

        ExternalNames[assembly] = name;

        return name;
    }

    [GeneratedRegex(@"[\\/]packs[\\/]([^\\/]+)\.Ref[\\/]", RegexOptions.IgnoreCase)]
    private static partial Regex SharedFramework();

    /** The name an interface is written by in a base list, without its namespace or type arguments. */
    public static string WrittenName(TypeSyntax type) => type switch
    {
        QualifiedNameSyntax qualified => WrittenName(qualified.Right),
        AliasQualifiedNameSyntax alias => WrittenName(alias.Name),
        SimpleNameSyntax simple => simple.Identifier.Text,
        _ => type.ToString(),
    };

    /**
     * The text of a declaration's doc comment, its `<summary>` when it has one, with `<see>` and
     * `<paramref>` read as the names they cite, and whitespace run together: a Test Double names its
     * kinds in its first sentence.
     */
    public static string DocOf(SyntaxNode node)
    {
        DocumentationCommentTriviaSyntax? doc = node.GetLeadingTrivia()
            .Select(trivia => trivia.GetStructure())
            .OfType<DocumentationCommentTriviaSyntax>()
            .LastOrDefault();

        if (doc is null)
        {
            return "";
        }

        XmlElementSyntax? summary = doc.Content
            .OfType<XmlElementSyntax>()
            .FirstOrDefault(element => element.StartTag.Name.LocalName.Text == "summary");
        string text = TextOf(summary is null ? doc.Content : summary.Content);

        return Whitespace().Replace(text, " ").Trim();
    }

    private static string TextOf(SyntaxList<XmlNodeSyntax> content) =>
        string.Concat(content.Select(node => node switch
        {
            XmlTextSyntax text => string.Concat(text.TextTokens.Select(token =>
                token.IsKind(SyntaxKind.XmlTextLiteralNewLineToken) ? " " : token.Text)),
            XmlElementSyntax element => TextOf(element.Content),
            XmlEmptyElementSyntax empty => string.Concat(empty.Attributes.Select(CitedBy)),
            _ => "",
        }));

    private static string CitedBy(XmlAttributeSyntax attribute) => attribute switch
    {
        XmlCrefAttributeSyntax cref => cref.Cref.ToString(),
        XmlNameAttributeSyntax name => name.Identifier.ToString(),
        XmlTextAttributeSyntax text => string.Concat(text.TextTokens.Select(token => token.Text)),
        _ => "",
    };

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    private static List<string> Distinct(IEnumerable<string?> ids) =>
        [.. ids.OfType<string>().Distinct(StringComparer.Ordinal)];
}
