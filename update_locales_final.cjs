const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src', 'locales');
const files = fs.readdirSync(localesDir);

const translations = {
  fr: "Développé par VenezuelanBiggie24, un fier développeur vénézuélien. Bien que les réalités du communisme m'aient forcé à quitter ma patrie, cette adversité s'est transformée en résilience, me permettant aujourd'hui d'écrire du code et de créer des solutions sans frontières depuis n'importe quel coin du monde.",
  de: "Entwickelt von VenezuelanBiggie24, einem stolzen venezolanischen Entwickler. Obwohl mich die Realität des Kommunismus zwang, meine Heimat zu verlassen, hat sich diese Widrigkeit in Widerstandsfähigkeit verwandelt und ermöglicht es mir heute, grenzenlose Lösungen von überall auf der Welt zu programmieren.",
  it: "Sviluppato da VenezuelanBiggie24, un orgoglioso sviluppatore venezuelano. Sebbene le realtà del comunismo mi abbiano costretto a lasciare la mia patria, quell'avversità si è trasformata in resilienza, permettendomi oggi di scrivere codice e creare soluzioni senza confini da qualsiasi angolo del mondo.",
  pt_br: "Desenvolvido por VenezuelanBiggie24, um orgulhoso desenvolvedor venezuelano. Embora as realidades do comunismo me tenham forçado a deixar minha casa, essa adversidade se transformou em resiliência, permitindo-me hoje escrever código e criar soluções sem fronteiras de qualquer lugar do mundo.",
  pt_pt: "Desenvolvido por VenezuelanBiggie24, um orgulhoso programador venezuelano. Embora as realidades do comunismo me tenham forçado a deixar a minha casa, essa adversidade transformou-se em resiliência, permitindo-me hoje escrever código e criar soluções sem fronteiras de qualquer lugar do mundo.",
  ru: "Разработано VenezuelanBiggie24, гордым венесуэльским разработчиком. Хотя реалии коммунизма заставили меня покинуть родину, эти невзгоды превратились в стойкость, позволяя мне сегодня писать код и создавать решения без границ из любого уголка мира.",
  ja: "誇り高きベネズエラの開発者、VenezuelanBiggie24によって開発されました。共産主義の現実が私を故郷から離れることを余儀なくさせましたが、その逆境は回復力に変わり、今日、世界のどこからでも国境のないソリューションをコーディングし、作成できるようになりました。",
  zh: "由 VenezuelanBiggie24 开发，一位自豪的委内瑞拉开发者。尽管共产主义的现实迫使我离开家乡，但那种逆境转化为韧性，使我今天能够在世界任何角落编写代码并创造无国界的解决方案。",
  ko: "자랑스러운 베네수엘라 개발자인 VenezuelanBiggie24가 개발했습니다. 공산주의의 현실 때문에 고향을 떠나야 했지만, 그 역경은 회복력으로 바뀌어 오늘날 전 세계 어디에서나 국경 없는 솔루션을 코딩하고 만들 수 있게 되었습니다.",
  ar: "تم التطوير بواسطة VenezuelanBiggie24، مطور فنزويلي فخور. على الرغم من أن حقائق الشيوعية أجبرتني على مغادرة وطني، إلا أن تلك المحنة تحولت إلى مرونة، مما أتاح لي اليوم كتابة التعليمات البرمجية وإنشاء حلول بلا حدود من أي مكان في العالم."
};

files.forEach(file => {
  if (file.endsWith('.json') && file !== 'en.json' && file !== 'es.json' && file !== 'es_ve.json') {
    const lang = file.replace('.json', '');
    const filePath = path.join(localesDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (translations[lang]) {
      data.about_desc = translations[lang];
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
      console.log(`Updated ${file} with native translation.`);
    }
  }
});
