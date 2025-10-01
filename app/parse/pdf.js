// app/parse/pdf.js
export async function extractTextFromPdf(file){
  if (!window.pdfjsLib) throw new Error('pdf.js nicht geladen');
  const buf = await file.arrayBuffer();
  const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let p=1; p<=doc.numPages; p++){
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = [];
    let currentY = null;
    let acc = [];
    for (const item of content.items){
      const str = item.str.replace(/\s+/g,' ').trim();
      const y = Math.round(item.transform[5]);
      if (currentY === null) currentY = y;
      if (Math.abs(y - currentY) > 2){
        lines.push(acc.join(' ').trim());
        acc = [str];
        currentY = y;
      } else {
        acc.push(str);
      }
    }
    if (acc.length) lines.push(acc.join(' ').trim());
    pages.push(lines.join('\n'));
  }
  return pages;
}

export async function extractItemsFromPdf(file){
  if (!window.pdfjsLib) throw new Error('pdf.js nicht geladen');
  const buf = await file.arrayBuffer();
  const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const items = [];
  for (let p=1; p<=doc.numPages; p++){
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    for (const it of content.items){
      const tx = it.transform;
      const x = tx[4], y = tx[5];
      items.push({ str: it.str, x, y, width: it.width, height: it.height, page: p, vw: viewport.width });
    }
  }
  return items;
}
