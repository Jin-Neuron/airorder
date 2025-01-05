import WebSocket from "ws";
import readline from "readline";
import fs from "fs";

var config = fs.readFileSync("./settingPrompt.txt", 'utf8');
//console.log(config.toString())
// WebSocketの接続
const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
const ws = new WebSocket(url, {
    headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "OpenAI-Beta": "realtime=v1",
    },
});

// 接続完了時に呼ばれる
ws.on("open", function open() {
    console.log("サーバに接続しました。");
    //注文仕様へ設定
    const event = {
        type: 'conversation.item.create',
        item: {
            type: 'message',
            role: 'user',
            content: [{
                type: 'input_text',
                text: config.toString(),
            }]
        }
    };
    ws.send(JSON.stringify(event));
    ws.send(JSON.stringify({type: 'response.create'}));
});

//コマンド入力の待機

process.stdin.setEncoding("utf8");

var reader = readline.createInterface({
  input: process.stdin,
});

reader.on("line", (line) => {
  //改行ごとに"line"イベントが発火される
    const event = {
        type: "conversation.item.create",
        item: {
            type: "message",
            role: "user",
            content: [{
                type: "input_text",
                text: line,
            }]
        },
    };
    // WebRTC data channel and WebSocket both have .send()
    ws.send(JSON.stringify(event));
    ws.send(JSON.stringify({type: 'response.create'}));

    //console.log(line + "を送信しました");
});

reader.on("close", () => {
  //標準入力のストリームが終了すると呼ばれる
  //console.log(lines); 
});

function handleEvent(e) {
    const serverEvent = JSON.parse(e.data);
    //console.log(serverEvent)
    if (serverEvent.type === "response.done") {
        console.log("GPT > " + serverEvent.response.output[0].content[0].transcript);
    }
}

ws.addEventListener("message", handleEvent);
