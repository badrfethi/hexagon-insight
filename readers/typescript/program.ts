import { posix } from "node:path";
import ts from "typescript";

/** One program over `tsconfig.check.json`: `src`, `features`, `contracts` and `tools`. */
export function programFor(root: string): ts.Program {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    posix.join(root, "tsconfig.check.json"),
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: failOn },
  );

  if (parsed === undefined) {
    throw new Error("tsconfig.check.json could not be read");
  }

  return ts.createProgram(parsed.fileNames, parsed.options);
}

/** The repository's own TypeScript files — no declaration files, nothing from `node_modules`. */
export function ownSourceFiles(program: ts.Program): readonly ts.SourceFile[] {
  return program
    .getSourceFiles()
    .filter((file) => !file.isDeclarationFile && !file.fileName.includes("/node_modules/"))
    .sort((one, other) => one.fileName.localeCompare(other.fileName));
}

function failOn(diagnostic: ts.Diagnostic): never {
  throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}
