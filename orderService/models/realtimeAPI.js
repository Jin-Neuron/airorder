//const WebSocket = require("ws");
const {Server} = require('socket.io');
const WebSocket = require("ws");
const fs = require("fs");

const realtimeAPI = (server) => {
    const io = new Server(server);

    const config = fs.readFileSync("./settingPrompt.txt", 'utf8');
    const model_4o = "gpt-4o-realtime-preview-2024-12-17";
    const model_4o_mini = "gpt-4o-mini-realtime-preview-2024-12-17";

    let isOrdering = false;

    // WebSocket接続の処理
    io.on("connection", (clientWs) => {
        console.log("Client connected");

        const url = "wss://api.openai.com/v1/realtime?model=" + model_4o;
        const openAiWS = new WebSocket(url, {
            headers: {
                "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
                "OpenAI-Beta": "realtime=v1",
            },
        });

        // 接続完了時に呼ばれる
        openAiWS.on("open", function open() {
            console.log("openAI WS connected");

            openAiWS.send(JSON.stringify({
                type: 'session.update',
                session: {
                    instructions: config.toString(),
                    voice: 'sage',
                    input_audio_transcription: { model: 'whisper-1' },
                    turn_detection: { type: "server_vad" }
                }
            }));
        });

        // クライアントからメッセージを受信したとき
        clientWs.on("sendChat", (msg) => {
            if(isOrdering){
                const event = {
                    type: 'conversation.item.create',
                        item: {
                        type: 'message',
                        role: 'user',
                        content: [{
                            type: 'input_text',
                            text: msg,
                        }]
                    }
                };
                openAiWS.send(JSON.stringify(event));
                openAiWS.send(JSON.stringify({type: 'response.create'}));
            }
        });
        clientWs.on("startOrder", (msg) => {
            console.log("startOrder");
            if(!isOrdering){
                console.log("Order Started.");
                isOrdering = true;
                //注文仕様へ設定
                const event = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'user',
                        content: [{
                            type: 'input_text',
                            text: '注文を開始してください。',
                        }]
                    }
                };

                openAiWS.send(JSON.stringify(event));
                openAiWS.send(JSON.stringify({type: 'response.create'}));
            }
        });
        clientWs.on("recordStream", (msg) => {
            //音声ストリームの開始
            openAiWS.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: msg
            }));
        });
        clientWs.on("stopStream", (msg) => {
            //音声ストリームの終了
            //bufferのcommitを送信後、responseをcreate
            openAiWS.send(JSON.stringify({type: 'input_audio_buffer.commit'}));
            openAiWS.send(JSON.stringify({type: 'response.create'}));
        });

         // OpenAIからデータを受信したとき
        openAiWS.on("message", (data) => {
            const serverEvent = JSON.parse(data);
            //console.log(serverEvent);

            if (serverEvent.type === "response.audio.delta") {
                 // 部分的な応答をリアルタイムで再生
                clientWs.emit("delta.audio", serverEvent.delta);
                // Access Base64-encoded audio chunks
            }else if (serverEvent.type === "response.audio_transcript.delta") {
                // 部分的な応答をリアルタイムで通知
                clientWs.emit("delta.text", serverEvent.delta);
            }else if (serverEvent.type === "response.done") {
                //テキストは随時送信しているため、空文字列で終了を通知
                clientWs.emit("final.text", "");
            }else if (serverEvent.type === "conversation.item.input_audio_transcription.completed"){
                //オーディオ入力の文字起こし完了
                clientWs.emit("final.audio", serverEvent.transcript);
            }else if (serverEvent.type === "response.done" &&
                        serverEvent.response.status === "failed"){
                console.log(serverEvent.response.status_details.error);
            }
        });

        // エラー処理
        openAiWS.on("error", (error) => {
            console.error("OpenAI WebSocket error:", error);
            //clientWs.send("Error connecting to OpenAI Realtime API");
        });

        // クライアントが切断したとき
        clientWs.on("disconnect", () => {
            console.log("Client disconnected");
            openAiWS.close();
            isOrdering = false;
        });
    });
}

module.exports = realtimeAPI
