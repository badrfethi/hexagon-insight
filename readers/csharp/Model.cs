namespace HexagonInsight.CSharp;

/*
 * The code facts of `analysis/model.ts` (`Code` and what it holds), as the JSON this reader writes.
 * The fields mean what they mean there; each record's doc says only what is C#'s about it.
 */

/** `Code`: everything the reader reads from a target's code. `steps` pairs by `Worlds.StepsPairs`. */
internal sealed record Code(
    IReadOnlyList<CodeFile> Files,
    IReadOnlyList<Declaration> Declarations,
    IReadOnlyList<string> CompositionRoots,
    IReadOnlyList<StepsPair> Steps,
    IReadOnlyList<string> Claimed);

/** `CodeFile`: a file git lists as code, one the reader compiles, or one a compiled file uses. */
internal sealed record CodeFile(
    string Path,
    bool Listed,
    bool Compiled,
    bool Test,
    int LinesOfCode,
    IReadOnlyList<string> Externals,
    IReadOnlyList<string> Declares,
    IReadOnlyList<string> Imports,
    IReadOnlyList<string> ConstructorParameterTypes,
    IReadOnlyList<string> Constructs,
    IReadOnlyList<string> ImportedFiles);

/** `Declaration`: a type the target declares. */
internal sealed record Declaration(
    string Id,
    string Name,
    string Kind,
    string File,
    int Line,
    bool Exported,
    IReadOnlyList<ImplementedName> Implements,
    IReadOnlyList<string> BuildsPerScenario,
    string Doc,
    int LinesOfCode);

/** `ImplementedName`: an interface in a type's base list, and its id when it is the target's own. */
internal sealed record ImplementedName(string Written, string? Target);

internal sealed record StepsPair(string Steps, string Feature);

/**
 * A target this reader cannot read into a model at all: no solution it can open, or a project that
 * will not load. `read.ts` turns it into the tool's `ReadFailure`; anything less is the rules' to
 * name, not a reason to stop.
 */
internal sealed class ReadFailure(string message) : Exception(message);
