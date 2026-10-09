using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

namespace HexagonInsight.CSharp;

/** Lines of code, the measure a block's size is drawn from: non-blank lines that are not only comment. */
internal static class Lines
{
    /**
     * The lines a token of `node` is on. Comments, blank lines and preprocessor directives are
     * trivia and hold no token, so they do not count; a string that spans lines counts each.
     */
    public static int CodeLinesOf(SyntaxNode node)
    {
        HashSet<int> lines = [];
        SyntaxTree tree = node.SyntaxTree;

        foreach (SyntaxToken token in node.DescendantTokens())
        {
            if (token.IsKind(SyntaxKind.EndOfFileToken) || token.Span.IsEmpty)
            {
                continue;
            }

            FileLinePositionSpan span = tree.GetLineSpan(token.Span);

            for (int line = span.StartLinePosition.Line; line <= span.EndLinePosition.Line; line++)
            {
                lines.Add(line);
            }
        }

        return lines.Count;
    }

    /**
     * The lines of a file that is not compiled: a C# file by its syntax, as above, and any other
     * (a feature, a page) by its non-blank lines, less a feature's `#` comments.
     */
    public static int CodeLinesIn(string absolute)
    {
        string text = File.ReadAllText(absolute);

        if (absolute.EndsWith(".cs", StringComparison.OrdinalIgnoreCase))
        {
            return CodeLinesOf(CSharpSyntaxTree.ParseText(text).GetRoot());
        }

        bool feature = absolute.EndsWith(".feature", StringComparison.OrdinalIgnoreCase);

        return text
            .Split('\n')
            .Select(line => line.Trim())
            .Count(line => line.Length > 0 && !(feature && line.StartsWith('#')));
    }
}
