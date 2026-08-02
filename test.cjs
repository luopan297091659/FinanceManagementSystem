const fs = require("node:fs");
const { PDFParse } = require("pdf-parse");

async function main() {
  const buffer = fs.readFileSync(
    "D:/工作相关/房产财务软件/nopassword2 page.pdf"
  );

  const parser = new PDFParse({ data: buffer });

  try {
    const textResult = await parser.getText();
    const infoResult = await parser.getInfo();

    console.log("页数：", infoResult.total);
    console.log("文字长度：", textResult.text.trim().length);
    console.log("提取结果：");
    console.log(JSON.stringify(textResult.text));
  } finally {
    await parser.destroy();
  }
}

main().catch(console.error);