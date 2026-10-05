import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { templateImage1, templateImage2, templateImage3 } from './artwork'
import { amountWords, euros, italianDate, type ReceiptSnapshot } from './model'
export function receiptPdf(s: ReceiptSnapshot, number: number | null) {
 const doc=new jsPDF({unit:'mm',format:'a4'});doc.setFont('times','normal');doc.setFontSize(11)
 const text=(value:string,x:number,y:number,width=165)=>{const lines=doc.splitTextToSize(value,width);doc.text(lines,x,y);return y+lines.length*5}
 doc.addImage(templateImage3,'JPEG',15,10,180,4.2)
 doc.addImage(templateImage1,'PNG',24,24,23,27)
 doc.setTextColor(54,37,96);doc.setFontSize(9);doc.setFont('helvetica','bold')
 doc.text(['Gruppo Scout Prato 6','Associazione Guide e Scouts Cattolici Italiani'],195,25,{align:'right'})
 doc.setFont('helvetica','normal');doc.text(['Via Medaglie d’Oro, 42','59100 - Prato (PO)','C.F. 92060890487','prato6@toscana.agesci.it'],195,34,{align:'right'})
 doc.setTextColor(0);doc.setFont('times','normal');doc.setFontSize(11);doc.text(`Prato, il ${italianDate(s.date)}`,195,60,{align:'right'})
 doc.setFont('times','bold');doc.text(`RICEVUTA DI PAGAMENTO N. ${number===null?'ANTEPRIMA':`${number} / ${s.year}`}`,24,73)
 doc.setFont('times','normal');let y=85
 y=text(`Ricevuto da (Genitore/Pagatore): ${s.payer.name}`,24,y)
 y=text(`Codice Fiscale Pagatore: ${s.payer.cf}`,24,y+2)
 y=text(`Per conto del/la ragazzo/a: ${s.boy.name}`,24,y+5)
 y=text(`Codice Fiscale ragazzo/a: ${s.boy.cf}`,24,y+2)
 y=text(`Importo ricevuto: ${euros(s.total)}`,24,y+5)
 y=text(`(Euro ${amountWords(s.total)})`,24,y+1)
 y=text(`Anno di riferimento: ${s.year}`,24,y+5)
 doc.text('Causale / Dettaglio:',24,y+5)
 autoTable(doc,{startY:y+9,margin:{left:24,right:24,bottom:49,top:22},head:[['Data','Causale / dettaglio','Versamento','Importo']],body:s.lines.map(l=>[italianDate(l.date),[l.category,l.period,l.note].filter(Boolean).join(' - '),l.method,euros(l.amount)]),styles:{font:'times',fontSize:10,cellPadding:2.3,overflow:'linebreak'},headStyles:{fillColor:[54,37,96]},columnStyles:{0:{cellWidth:24},1:{cellWidth:80},2:{cellWidth:28},3:{cellWidth:30,halign:'right'}}})
 y=(doc as jsPDF & {lastAutoTable:{finalY:number}}).lastAutoTable.finalY+9
 const methods=[...new Set(s.lines.map(l=>l.method))].map(method=>`${method}: ${euros(s.lines.filter(l=>l.method===method).reduce((n,l)=>n+l.amount,0))}`).join(' | ')
 const methodLines=doc.splitTextToSize(`Modalità di versamento: ${methods}`,162)
 if(y+methodLines.length*5+40>260){doc.addPage();y=25}
 doc.setFont('times','normal');doc.setFontSize(11);doc.text(methodLines,24,y);y+=methodLines.length*5+10
 doc.setFont('times','bold');doc.text('Il Tesoriere di Unità',183,y,{align:'right'});doc.setFont('times','normal');doc.text(s.treasurer,183,y+6,{align:'right'})
 const props=doc.getImageProperties(s.signature);const w=Math.min(45,props.width/props.height*18);const h=Math.min(18,props.height/props.width*w)
 doc.addImage(s.signature,s.signature.startsWith('data:image/png')?'PNG':'JPEG',183-w,y+9,w,h)
 for(let page=1;page<=doc.getNumberOfPages();page++){
  doc.setPage(page);if(page>1){doc.setFont('times','normal');doc.setFontSize(9);doc.text(`Ricevuta ${number===null?'ANTEPRIMA':number}/${s.year} - ${s.boy.name}`,24,14)}doc.setFont('times','bold');doc.setFontSize(8)
  doc.text("Esente da imposta di bollo ai sensi dell'Art. 82, comma 5, D.Lgs. 117/2017 (Codice del Terzo Settore)",24,271)
  doc.setFont('times','normal');doc.setFontSize(7)
  doc.addImage(templateImage2,'JPEG',17,280,20,9.4)
  doc.text(['Iscritta al Registro Regionale delle Associazioni di Promozione Sociale n.23 - Legge 383/2000','WAGGGS / WOSM Member'],43,282)
  doc.text(`${page} / ${doc.getNumberOfPages()}`,195,289,{align:'right'})
 }
 return new Uint8Array(doc.output('arraybuffer'))
}
