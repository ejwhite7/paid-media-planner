// A minimal .xlsx writer: a few sheets of strings and numbers, a bold header row that stays frozen with a filter on it,
// wrapped long text and sensible column widths. No dependencies: the workbook is SpreadsheetML in a zip (deflated with
// node:zlib), which Excel, Numbers, Google Sheets and LibreOffice all open.
import { deflateRawSync } from "node:zlib";

const CRC = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
const crc32 = (buf) => {
	let c = 0xffffffff;
	for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};

// files: [{ name, data: string | Buffer }] → zip Buffer.
export function zip(files) {
	const local = [];
	const central = [];
	let offset = 0;
	for (const f of files) {
		const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
		const body = deflateRawSync(raw);
		const name = Buffer.from(f.name, "utf8");
		const crc = crc32(raw);
		const head = Buffer.alloc(30);
		head.writeUInt32LE(0x04034b50, 0);
		head.writeUInt16LE(20, 4);
		head.writeUInt16LE(0x0800, 6); // UTF-8 names
		head.writeUInt16LE(8, 8); // deflate
		head.writeUInt32LE(0x00210000, 10); // 1980-01-01 00:00
		head.writeUInt32LE(crc, 14);
		head.writeUInt32LE(body.length, 18);
		head.writeUInt32LE(raw.length, 22);
		head.writeUInt16LE(name.length, 26);
		const dir = Buffer.alloc(46);
		dir.writeUInt32LE(0x02014b50, 0);
		dir.writeUInt16LE(20, 4);
		dir.writeUInt16LE(20, 6);
		dir.writeUInt16LE(0x0800, 8);
		dir.writeUInt16LE(8, 10);
		dir.writeUInt32LE(0x00210000, 12);
		dir.writeUInt32LE(crc, 16);
		dir.writeUInt32LE(body.length, 20);
		dir.writeUInt32LE(raw.length, 24);
		dir.writeUInt16LE(name.length, 28);
		dir.writeUInt32LE(offset, 42);
		local.push(head, name, body);
		central.push(dir, name);
		offset += head.length + name.length + body.length;
	}
	const size = central.reduce((a, b) => a + b.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(size, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...local, ...central, end]);
}

const x = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const col = (i) => (i >= 26 ? col(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));

// sheets: [{ name, rows: [[cell]], header = true }]; a cell is a string, a number, null, an array (joined with "; "), or
// { v, style: "head" | "label" } to style one cell. Styles: 0 plain, 1 header, 2 wrapped text, 3 bold label. All top-aligned.
const STYLE = { head: 1, wrap: 2, label: 3 };
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v.v : v);
function sheetXml({ rows, header = true }) {
	const width = Math.max(1, ...rows.map((r) => r.length));
	const widths = Array.from({ length: width }, (_, c) => Math.min(60, Math.max(8, ...rows.map((r) => { const v = plain(r[c]); return String(Array.isArray(v) ? v.join("; ") : v ?? "").split("\n")[0].length + 2; }))));
	const body = rows
		.map((r, ri) => {
			const cells = r
				.map((cell, ci) => {
					const ref = `${col(ci)}${ri + 1}`;
					const v = plain(cell);
					if (v == null || v === "") return "";
					const style = (header && ri === 0) || cell?.style ? ` s="${STYLE[cell?.style] ?? 1}"` : "";
					if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
					const s = Array.isArray(v) ? v.join("; ") : String(v);
					return `<c r="${ref}" t="inlineStr"${style || (s.length > 60 || s.includes("\n") ? ' s="2"' : "")}><is><t xml:space="preserve">${x(s.slice(0, 32000))}</t></is></c>`;
				})
				.join("");
			return `<row r="${ri + 1}">${cells}</row>`;
		})
		.join("");
	const freeze = header ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
	const filter = header && rows.length > 1 ? `<autoFilter ref="A1:${col(width - 1)}${rows.length}"/>` : "";
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${body}</sheetData>${filter}</worksheet>`;
}

export function workbook(sheets) {
	const names = sheets.map((s, i) => x(s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Sheet${i + 1}`));
	const files = [
		{
			name: "[Content_Types].xml",
			data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
		},
		{ name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
		{
			name: "xl/workbook.xml",
			data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
		},
		{
			name: "xl/_rels/workbook.xml.rels",
			data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
		},
		{
			name: "xl/styles.xml",
			data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF242426"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top"/></xf></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
		},
		...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
	];
	return zip(files);
}
