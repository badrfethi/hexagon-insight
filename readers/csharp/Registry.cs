using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace HexagonInsight.CSharp;

/**
 * The target's own types, each under one id, `<file>#<name>`, with `@<line>` added when its file
 * declares that name twice (`Result` and `Result<T>`, or two nested types). A type is the target's
 * own when it is declared in a file the reader compiles; a partial type is told by the first of its
 * parts, in path order. Every top-level class and interface is here, and any other type a file or
 * a declaration points at, such as an enum or a nested class.
 */
internal sealed class Registry
{
    private readonly Dictionary<SyntaxTree, Reader.Source> _sources;
    private readonly Dictionary<ISymbol, string> _ids = new(SymbolEqualityComparer.Default);
    private readonly Dictionary<string, Declaration> _declarations = [];

    public Registry(IReadOnlyList<Reader.Source> sources)
    {
        this._sources = sources.ToDictionary(source => source.Tree);

        foreach (Reader.Source source in sources)
        {
            foreach (TypeDeclarationSyntax type in Facts.TopLevelTypes(source.Tree.GetRoot()))
            {
                if (source.Model.GetDeclaredSymbol(type) is INamedTypeSymbol symbol)
                {
                    this.IdOf(symbol);
                }
            }
        }
    }

    public IEnumerable<Declaration> All => this._declarations.Values;

    public Declaration Get(string id) => this._declarations[id];

    /** The id of a type, registering it the first time; null when it is not the target's own. */
    public string? IdOf(ITypeSymbol type)
    {
        if (type is not INamedTypeSymbol named)
        {
            return null;
        }

        INamedTypeSymbol symbol = named.OriginalDefinition;

        if (this._ids.TryGetValue(symbol, out string? known))
        {
            return known;
        }

        (Reader.Source Source, SyntaxNode Node)? first = symbol.DeclaringSyntaxReferences
            .Where(reference => this._sources.ContainsKey(reference.SyntaxTree))
            .Select(reference => (Source: this._sources[reference.SyntaxTree], Node: reference.GetSyntax()))
            .OrderBy(part => part.Source.Path, StringComparer.Ordinal)
            .ThenBy(part => part.Node.SpanStart)
            .Cast<(Reader.Source, SyntaxNode)?>()
            .FirstOrDefault();

        if (first is not { } part)
        {
            return null;
        }

        int line = part.Source.Tree.GetLineSpan(part.Node.Span).StartLinePosition.Line + 1;
        string id = $"{part.Source.Path}#{symbol.Name}" + (Twice(part.Source, symbol.Name) ? $"@{line}" : "");

        // Registered before its own facts are read, so a type that names itself resolves to this id.
        this._ids[symbol] = id;
        this._declarations[id] = this.DeclarationOf(id, symbol, part.Source, part.Node, line);

        return id;
    }

    private Declaration DeclarationOf(string id, INamedTypeSymbol symbol, Reader.Source source, SyntaxNode node, int line)
    {
        string kind = symbol.TypeKind switch
        {
            TypeKind.Interface => "interface",
            TypeKind.Class or TypeKind.Struct => "class",
            _ => "other",
        };

        return new Declaration(
            id,
            symbol.Name,
            kind,
            source.Path,
            line,
            symbol.DeclaredAccessibility == Accessibility.Public,
            kind == "class" ? this.ImplementsOf(symbol) : [],
            [],
            Facts.DocOf(node),
            kind == "class" ? Lines.CodeLinesOf(node) : 0);
    }

    /** The interfaces in the base list of each of its own parts, as written, in the order written. */
    private List<ImplementedName> ImplementsOf(INamedTypeSymbol symbol)
    {
        List<ImplementedName> names = [];

        foreach (SyntaxReference reference in symbol.DeclaringSyntaxReferences)
        {
            if (!this._sources.TryGetValue(reference.SyntaxTree, out Reader.Source? source) ||
                reference.GetSyntax() is not BaseTypeDeclarationSyntax { BaseList: { } list })
            {
                continue;
            }

            foreach (BaseTypeSyntax written in list.Types)
            {
                if (source.Model.GetTypeInfo(written.Type).Type is INamedTypeSymbol { TypeKind: TypeKind.Interface } port)
                {
                    names.Add(new ImplementedName(Facts.WrittenName(written.Type), this.IdOf(port)));
                }
            }
        }

        return names;
    }

    /** The file declares more than one type of this name, at any depth. */
    private static bool Twice(Reader.Source source, string name) =>
        source.Tree.GetRoot()
            .DescendantNodes()
            .OfType<BaseTypeDeclarationSyntax>()
            .Count(type => type.Identifier.Text == name) > 1;
}
