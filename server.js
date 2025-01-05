//import WebSocket from "ws";
//import readline from "readline";
//import fs from "fs";
const express = require("express");
const WebSocket = require("ws");
const fs = require("fs");

const app = express();
const port = 3000;

app.use(express.static("public"));
// WebSocketサーバーを作成
const wss = new WebSocket.Server({ noServer: true });

var config = fs.readFileSync("./settingPrompt.txt", 'utf8');
// WebSocket接続の処理
wss.on("connection", (clientWs) => {
    console.log("Client connected");

    const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
    const openAiWS = new WebSocket(url, {
        headers: {
            "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
            "OpenAI-Beta": "realtime=v1",
        },
    });

    // 接続完了時に呼ばれる
    openAiWS.on("open", function open() {
        console.log("openAI WS connected");
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
        openAiWS.send(JSON.stringify(event));
        openAiWS.send(JSON.stringify({type: 'response.create'}));
    });

    // クライアントからメッセージを受信したとき
    clientWs.on("message", (message) => {
        console.log("Message from client:", message.toString());
        const event = {
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [{
                    type: 'input_text',
                    text: message.toString(),
                }]
            }
        };
        openAiWS.send(JSON.stringify(event));
        openAiWS.send(JSON.stringify({type: 'response.create'}));
    });

     // OpenAIからデータを受信したとき
    openAiWS.on("message", (data) => {
        const serverEvent = JSON.parse(data);

        //console.log(serverEvent)
        if (serverEvent.type === "response.audio_transcript.delta") {
            // 部分的な応答をリアルタイムで表示
            clientWs.send(JSON.stringify({
                type : "delta",
                text : serverEvent.delta,
            }));
        }
        if (serverEvent.type === "response.done") {
            clientWs.send(JSON.stringify({
                type : "final",
                text : "",
            }));
        }
    });

    // エラー処理
    openAiWS.on("error", (error) => {
        console.error("OpenAI WebSocket error:", error);
        clientWs.send("Error connecting to OpenAI Realtime API");
      });

    // クライアントが切断したとき
    clientWs.on("close", () => {
        console.log("Client disconnected");
        openAiWs.close();
    });
});

// HTTPサーバーとWebSocketサーバーを統合
const server = app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
    });
});
