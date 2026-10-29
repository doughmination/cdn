// R2 only has keys, so a folder exists while something is in it. An empty
// folder is held open by this zero-byte marker, which the viewer hides. Upload
// paths can't have dot-names, so nobody's file can clash with it.

export const FOLDER_MARKER = ".keep";
