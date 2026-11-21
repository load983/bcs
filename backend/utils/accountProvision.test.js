const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { parseFile } = require('./accountProvision');

test('parseFile extracts tabular text from DOCX without Mammoth', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-import-'));
  const filePath = path.join(tempDir, 'students.docx');
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:t>name,phone,roll</w:t></w:r></w:p>
      <w:p><w:r><w:t>Alice,01700000000,101</w:t></w:r></w:p>
    </w:body></w:document>`);
  await fs.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }));

  try {
    const rows = await parseFile({ path: filePath, originalname: 'students.docx' });
    assert.deepEqual(rows, [{ name: 'Alice', phone: '01700000000', roll: '101' }]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('parseFile rejects legacy XLS spreadsheets', async () => {
  await assert.rejects(
    parseFile({ path: '/does/not/need/to/exist.xls', originalname: 'students.xls' }),
    /পুরোনো \.xls ফাইল সমর্থিত নয়/,
  );
});
