const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateAnalysisPdf() {
  const pdfDoc = await PDFDocument.create();
  
  // Embed fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  
  // Page properties (A4)
  const pageWidth = 595.27;
  const pageHeight = 841.89;
  const margin = 50;
  const contentWidth = pageWidth - (margin * 2);
  
  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 60; // Start position
  
  // Helper for drawing header and footer
  function drawPageTemplate(page, pageNum) {
    // Top bordeaux header bar
    page.drawRectangle({
      x: 0,
      y: pageHeight - 15,
      width: pageWidth,
      height: 15,
      color: rgb(107/255, 17/255, 36/255) // Bordeaux #6B1124
    });
    
    // Footer line
    page.drawLine({
      start: { x: margin, y: 40 },
      end: { x: pageWidth - margin, y: 40 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8)
    });
    
    // Footer text
    page.drawText('cauZon - Fiche de Spécifications Techniques PDF', {
      x: margin,
      y: 25,
      size: 8,
      font: fontOblique,
      color: rgb(0.5, 0.5, 0.5)
    });
    
    page.drawText(`Page ${pageNum}`, {
      x: pageWidth - margin - 30,
      y: 25,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5)
    });
  }
  
  let pageCount = 1;
  drawPageTemplate(currentPage, pageCount);
  
  // Wrap text helper
  function wrapText(text, width, font, fontSize) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = font.widthOfTextAtSize(testLine, fontSize);
      
      if (textWidth > width) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }
  
  function addParagraph(text, options = {}) {
    const size = options.size || 10;
    const font = options.font || fontRegular;
    const color = options.color || rgb(0.15, 0.15, 0.15);
    const leading = options.leading || (size * 1.4);
    const isBold = options.isBold || false;
    
    const lines = wrapText(text, contentWidth, font, size);
    
    for (const line of lines) {
      if (y - leading < 60) {
        // Add new page
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        pageCount++;
        drawPageTemplate(currentPage, pageCount);
        y = pageHeight - 60;
      }
      
      currentPage.drawText(line, {
        x: margin,
        y: y,
        size: size,
        font: font,
        color: color
      });
      y -= leading;
    }
    y -= (options.spaceAfter || 8); // paragraph spacing
  }

  function addHeading1(text) {
    y -= 10;
    addParagraph(text, {
      size: 16,
      font: fontBold,
      color: rgb(107/255, 17/255, 36/255), // Bordeaux #6B1124
      leading: 22,
      spaceAfter: 10
    });
  }

  function addHeading2(text) {
    y -= 5;
    addParagraph(text, {
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
      leading: 16,
      spaceAfter: 6
    });
  }

  // --- BUILD PDF CONTENT ---
  
  // Document Title / Header
  currentPage.drawRectangle({
    x: margin,
    y: y - 50,
    width: contentWidth,
    height: 50,
    color: rgb(249/255, 250/255, 251/255),
    borderColor: rgb(107/255, 17/255, 36/255),
    borderWidth: 1
  });
  
  currentPage.drawText('ANALYSE DE STYLE & SPÉCIFICATIONS PDF', {
    x: margin + 15,
    y: y - 22,
    size: 14,
    font: fontBold,
    color: rgb(107/255, 17/255, 36/255)
  });
  
  currentPage.drawText('Document Officiel de Cadrage Technique - cauZon', {
    x: margin + 15,
    y: y - 38,
    size: 9,
    font: fontOblique,
    color: rgb(0.4, 0.4, 0.4)
  });
  
  y -= 70;
  
  addHeading1('1. Introduction & Objectif');
  addParagraph('Ce document sert de base de specification technique pour la fabrication de fichiers PDF conformes et optimises pour les applications mobile et web de cauZon. L\'objectif est de definir un standard de fichier PDF de haute qualite graphique, leger et immediatement lisible dans toutes les configurations de reseau et d\'appareils (iOS, Android, Web).');
  
  addHeading1('2. Fiche Technique du PDF Optimal');
  addParagraph('Pour une integration reussie sur l\'application mobile de cauZon, chaque document PDF doit respecter les contraintes techniques suivantes :');
  
  addHeading2('A. Norme de fichier (PDF 1.4 a 1.7 ou PDF/A)');
  addParagraph('La norme PDF/A (notamment PDF/A-2b) est fortement recommandee. Elle garantit l\'incorporation totale des polices, des images et des profils colorimetriques dans le fichier, interdisant les references externes ou le code dynamique (JavaScript) susceptible de bloquer le rendu.');
  
  addHeading2('B. La Linearisation (Fast Web View)');
  addParagraph('Le PDF doit etre linearise (Optimise pour le Web). Contrairement au format classique, un PDF linearise place la table d\'indexation au debut du fichier, permettant d\'afficher la premiere page instantanement tandis que le reste du document se charge en arriere-plan.');
  
  addHeading2('C. Poids et Dimensions des Fichiers');
  addParagraph('Afin de prevenir les crashs lies au manque de memoire vive (OOM - Out of Memory) sur les smartphones d\'entree de gamme, le poids des PDF ne doit pas exceder 5 Mo a 15 Mo. La resolution ideale pour l\'affichage sur ecran mobile est de 72 a 150 DPI (evitez le 300 DPI reserve a l\'impression).');
  
  addHeading2('D. Polices de Caracteres (Fonts)');
  addParagraph('Toutes les polices de caracteres utilisees dans le document (notamment les polices d\'equations mathematiques ou de codes informatiques) doivent etre integrees au fichier (Embedded Subset). Cela previent les chevauchements et les textes invisibles.');

  addHeading1('3. Outils et Methodes de Conversion');
  addParagraph('Pour fabriquer vos documents PDF conformes au projet cauZon, plusieurs options professionnelles gratuites s\'offrent a vous :');
  
  addParagraph('- Canva : Telechargez vos designs en choisissant l\'option "PDF Standard" (ideal pour le web) plutôt que "PDF pour Impression".');
  addParagraph('- Microsoft Word / LibreOffice : Exportez en PDF en selectionnant "Taille minimale (publication en ligne)" dans les parametres.');
  addParagraph('- Adobe Online PDF Compressor : Utilisez le compresseur officiel en ligne d\'Adobe pour reduire le poids des documents trop lourds.');
  addParagraph('- DocPub Linearizer : Un service en ligne gratuit pour lineariser tout PDF et activer le "Fast Web View".');

  addHeading1('4. Conclusion & Recommandations');
  addParagraph('En suivant ces regles d\'optimisation, vos documents s\'ouvriront de maniere fluide, meme sur de petites connexions mobiles 3G/4G, offrant aux eleves et etudiants de la plateforme cauZon une experience utilisateur premium.');

  // Save the PDF
  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join('c:', 'Users', 'badou', 'creation__cauZon', 'analyse_de_style_PDF.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`✅ PDF generated successfully at ${outputPath}`);
}

generateAnalysisPdf().catch(console.error);
