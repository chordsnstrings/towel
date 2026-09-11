import { parentPort, workerData } from "node:worker_threads";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
const maxRows = 5000;
try {
  const buffer = Buffer.from(workerData.buffer);
  let rows;
  if (workerData.extension === "csv") {
    const parsed = parse(buffer, {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 20000,
      relax_column_count: false,
    });
    if (parsed.length > maxRows + 1)
      throw new Error("Upload no more than 5,000 members at a time.");
    rows = parsed.map((row) =>
      row.map((value) => ({
        value: String(value).trim(),
        numeric: false,
        formula: false,
      })),
    );
  } else {
    // Reject oversized ZIP expansion before ExcelJS allocates worksheet objects.
    let expanded = 0,
      entries = 0;
    for (
      let i = Math.max(0, buffer.length - 65557);
      i <= buffer.length - 22;
      i++
    ) {
      if (buffer.readUInt32LE(i) !== 0x06054b50) continue;
      let offset = buffer.readUInt32LE(i + 16);
      const count = buffer.readUInt16LE(i + 10);
      if (count === 65535 || count > 2000)
        throw new Error(
          "This workbook is too complex. Save the member sheet as CSV.",
        );
      for (let n = 0; n < count; n++) {
        if (
          offset + 46 > buffer.length ||
          buffer.readUInt32LE(offset) !== 0x02014b50
        )
          throw new Error("Invalid Excel workbook.");
        expanded += buffer.readUInt32LE(offset + 24);
        entries++;
        offset +=
          46 +
          buffer.readUInt16LE(offset + 28) +
          buffer.readUInt16LE(offset + 30) +
          buffer.readUInt16LE(offset + 32);
      }
      break;
    }
    if (!entries || expanded > 25 * 1024 * 1024)
      throw new Error(
        "Workbook is too large when expanded. Save the member sheet as CSV.",
      );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet =
      workbook.worksheets.find((s) => s.state === "visible") ||
      workbook.worksheets[0];
    if (!sheet || sheet.rowCount > maxRows + 1 || sheet.columnCount > 50)
      throw new Error("Use a sheet with at most 5,000 members and 50 columns.");
    rows = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells = [];
      for (let n = 1; n <= sheet.columnCount; n++) {
        const cell = row.getCell(n);
        cells.push({
          value: String(cell.text || "").trim(),
          numeric: typeof cell.value === "number",
          formula: !!cell.formula,
        });
      }
      rows.push(cells);
    });
  }
  if (rows.length < 2 || rows[0].length > 50)
    throw new Error(
      "Include a header row and at least one member (maximum 50 columns).",
    );
  const headers = rows.shift().map((x, i) => x.value || `Column ${i + 1}`);
  if (new Set(headers).size !== headers.length)
    throw new Error("Column headers must be unique.");
  const records = rows
    .map((cells, index) => ({ line: index + 2, cells }))
    .filter((row) => row.cells.some((x) => x.value));
  if (!records.length) throw new Error("This file has no member rows.");
  parentPort.postMessage({ headers, records });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
