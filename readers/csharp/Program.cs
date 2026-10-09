using System.Text.Json;
using System.Text.Json.Serialization;
using HexagonInsight.CSharp;

/*
 * `HexagonInsight.CSharp <root> <solution>`: reads the target at `root` through its solution, a
 * path relative to it, and writes the model's code facts as JSON to standard output. It exits 3,
 * with the reason on standard error, when the target cannot be read (`ReadFailure`), and 2 when it
 * is started wrong.
 */

if (args.Length != 2)
{
    await Console.Error.WriteLineAsync("Usage: HexagonInsight.CSharp <root> <solution>").ConfigureAwait(false);
    return 2;
}

string root = Path.GetFullPath(args[0]);

try
{
    Code code = await Reader.ReadAsync(root, Path.Combine(root, args[1])).ConfigureAwait(false);
    JsonSerializerOptions options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
    Stream output = Console.OpenStandardOutput();

    await using (output.ConfigureAwait(false))
    {
        await JsonSerializer.SerializeAsync(output, code, options).ConfigureAwait(false);
    }

    return 0;
}
catch (ReadFailure failure)
{
    await Console.Error.WriteLineAsync(failure.Message).ConfigureAwait(false);
    return 3;
}
