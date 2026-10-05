/// The two ways reading a document fails that a teacher can act on.
///
/// Their own module, with no dependencies at all, and that is the point.
/// documentText.ts pulls in tesseract, pdf-parse, mammoth and xlsx — 215MB at
/// import time, measured — and anything importing these classes from there
/// made the server carry all of it for the life of the process, whether or
/// not a document was ever uploaded. The parsers belong in the child; only
/// the names of the failures belong in the server.

/// A file type nothing here can read.
export class UnsupportedFileError extends Error {}

/// A file that was read, and had nothing in it — an empty document, or a
/// photograph OCR could not make out.
export class NoTextFoundError extends Error {}
