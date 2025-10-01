export async function extractTextFromPdf(file) {
  const arrayBuf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
  const pages = [];
  for (let i=1; i<=pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(it => it.str).join('\n');
    pages.push(text);
  }
  return pages;
}
