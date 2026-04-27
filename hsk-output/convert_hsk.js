const fs = require('fs');
const path = require('path');

const files = [
    { name: 'HSK1.csv', level: 1 },
    { name: 'HSK2.csv', level: 2 },
    { name: 'HSK3.csv', level: 3 },
    { name: 'HSK4.csv', level: 4 }
];

let vocabSql = "INSERT INTO public.vocab (hanzi, pinyin, meaning, hsk_level, category) VALUES\n";
let sentenceSql = "INSERT INTO public.short_sentences (chinese, pinyin, meaning, hsk_level, category) VALUES\n";

const vocabEntries = [];
const sentenceEntries = [];

// Simple keyword-based categorization
function getCategory(hanzi, meaning) {
    const text = hanzi + meaning;
    // Chào hỏi (Greetings/Social) - Priority
    if (/你好|再见|谢谢|对不起|没关系|不客气|请|喂|问候|欢迎|祝/.test(text)) return 'Chào hỏi';
    if (/你|我|thế nào|bao nhiêu|này|kia|đó|của|ai|gì|đâu/.test(text)) return 'Giao tiếp';
    
    if (/爸|妈|弟|兄|姐|妹|子|妻|夫|奶|爷|亲|儿子|女儿|孩子/.test(text)) return 'Gia đình';
    if (/吃|喝|菜|饭|水|茶|咖啡|肉|蛋|鱼|果|糖|甜|咸|酸|苦|苹果|米饭/.test(text)) return 'Ăn uống';
    if (/学|教|书|笔|字|考试|成绩|词|语法|历史|数学|课|老师|学生/.test(text)) return 'Trường học';
    if (/年|月|日|号|点|分|秒|时间|今天|昨天|明天|现在|过去|将来|季节|春|夏|秋|冬|平时|时候/.test(text)) return 'Thời gian';
    if (/站|场|馆|店|山|河|城|路|里|外|左|right|右|东|西|南|北|这里|那里|环境|地址|北京|中国/.test(text)) return 'Địa điểm';
    if (/车|机|船|飞|坐|骑|交通|路|票|航班|换|办|出|出租车|飞机/.test(text)) return 'Giao thông';
    if (/工|职|薪|工资|生意|面试|应聘|管理|安排|计划|任务|工作|医生/.test(text)) return 'Công việc';
    if (/看|听|玩|游|影|视|播|唱|跳|画|新|网|游戏|兴趣|电视|电影/.test(text)) return 'Giải trí';
    if (/狗|猫|马|鸟|熊|虎|动物/.test(text)) return 'Động vật';
    if (/钱|元|角|分|买|卖|贵|便宜|打折|现金|信用卡/.test(text)) return 'Mua sắm';
    if (/(^天气$)|(下雨)|(下雪)|(晴天)|(冷)|(热)|(温度)/.test(text)) return 'Thời tiết';
    if (/身|疼|病|医|院|药|洗|澡|睡|健康|习惯|皮肤|胳膊|身体/.test(text)) return 'Sức khỏe';
    if (/心|爱|情|哭|笑|难|怕|担心|后悔|愉快|开心|满意|激动|害羞|高兴|喜欢/.test(text)) return 'Cảm xúc';
    if (/好|坏|大|小|多|少|重|轻|长|短|快|慢|准|错|新|旧|干净|脏|深|浅|漂亮/.test(text)) return 'Tính chất';
    if (/一|二|三|四|五|六|七|八|九|十|百|千|万|倍|数字|多少|几/.test(text)) return 'Số lượng';
    return 'Khác';
}

function escapeSql(str) {
    if (!str) return '';
    return str.replace(/'/g, "''").trim();
}

files.forEach(file => {
    const filePath = path.join(__dirname, file.name);
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${file.name}`);
        return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach(line => {
        if (!line.trim()) return;
        // Split by comma, but handle quoted commas if necessary. 
        // User files seem to use standard comma or sometimes quotes.
        // Simplified parser for this specific format
        const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        
        if (parts.length >= 3) {
            const hanzi = parts[0].replace(/"/g, '').trim();
            const pinyin = parts[1].replace(/"/g, '').trim();
            const meaning = parts[2].replace(/"/g, '').trim();
            const cat = getCategory(hanzi, meaning);

            if (hanzi && pinyin) {
                vocabEntries.push(`('${escapeSql(hanzi)}', '${escapeSql(pinyin)}', '${escapeSql(meaning)}', ${file.level}, '${cat}')`);
            }

            // Example Sentence
            if (parts.length >= 6) {
                const sChinese = parts[3].replace(/"/g, '').trim();
                const sPinyin = parts[4].replace(/"/g, '').trim();
                const sMeaning = parts[5].replace(/"/g, '').trim();
                if (sChinese && sPinyin) {
                    sentenceEntries.push(`('${escapeSql(sChinese)}', '${escapeSql(sPinyin)}', '${escapeSql(sMeaning)}', ${file.level}, '${cat}')`);
                }
            }
        }
    });
});

const output = `
-- FINAL HSK IMPORT SCRIPT
-- Generated automatically from CSV files

TRUNCATE TABLE public.vocab RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.short_sentences RESTART IDENTITY CASCADE;

${vocabSql}${vocabEntries.join(',\n')};

${sentenceSql}${sentenceEntries.join(',\n')};

NOTIFY pgrst, 'reload schema';
`;

fs.writeFileSync(path.join(__dirname, 'FINAL_HSK_IMPORT.sql'), output);
console.log("Generated FINAL_HSK_IMPORT.sql with " + vocabEntries.length + " words and " + sentenceEntries.length + " sentences.");
