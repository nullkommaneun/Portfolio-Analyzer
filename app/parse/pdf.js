export async function extractTextFromPdf(file) {
  if (!window.pdfjsLib) {
    throw new Error('pdfjsLib ist nicht geladen. Prüfe die <script>-Einbindung in index.html.');
  }
  try {
    const version = (window.pdfjsLib && window.pdfjsLib.version) ? window.pdfjsLib.version : '4.6.82';
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
  } catch (e) {
    console.warn('Konnte workerSrc nicht setzen, deaktiviere Worker.', e);
    window.pdfjsLib.disableWorker = true;
  }
  const arrayBuf = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuf });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let i=1; i<=pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(it => it.str).join('\n');
    pages.push(text);
  }
  return pages;
}
