export async function extractTextFromPdf(file) {
  if (!window.pdfjsLib) {
    throw new Error('pdfjsLib ist nicht geladen. Prüfe index.html (ESM-Import).');
  }
  const arrayBuf = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuf });
  const pdf = await loadingTask.promise;

  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(it => it.str).join('\n');
    pages.push(text);
  }
  return pages;
}
