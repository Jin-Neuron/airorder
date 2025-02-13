const ws = new WebSocket(`ws://${window.location.host}`);
const statusDiv = document.getElementById('status');
const messagesDiv = document.getElementById("messages");
let realtimeMSG;
let inputMSG;

const input = document.getElementById("input");
const sendButton = document.getElementById("send");
const startButton = document.getElementById("start");
const startTalk = document.getElementById("startInput");
const stopTalk = document.getElementById("stopInput");

let partialResponse = ""; // 部分応答を蓄積する変数
let finalInput = "";
// 音声データキュー
const audioQueue = [];
let isPlaying = false;
let audioStream; // マイク入力のストリーム
let workletNode;
const bufferSize = 1024;
const samplerate = 24000;//OpenAI RealtimeAPIは24kHzにのみ対応
// Web Audio APIのセットアップ
const audioContext = new AudioContext({
    sampleRate: samplerate  // サンプリングレートを24kHzに設定
});
// マイク入力を開始
async function startMicrophone() {
    try {
        await audioContext.audioWorklet.addModule('worklet-processor.js');
        // マイクからの音声を取得
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const input = audioContext.createMediaStreamSource(audioStream);

        workletNode = new AudioWorkletNode(audioContext, 'audio-processor', {
            processorOptions: {
              bufferSize: bufferSize,
            },
        });

        workletNode.port.onmessage = (event) => {
            const inputData = event.data;
            const base64Chunk = base64EncodeAudio(inputData); // PCM 16bit に変換
            ws.send(JSON.stringify({
                type: "recordStream",
                text: base64Chunk
            }));
        };
        input.connect(workletNode);
    } catch (err) {
        console.error("Error accessing microphone:", err);
    }
}

// マイク入力を停止
function stopMicrophone() {
    //console.log("stop Mic");
    if (audioStream) {
        const tracks = audioStream.getTracks();
        tracks.forEach((track) => track.stop());
        // AudioWorkletProcessor に停止命令を送信
        workletNode.port.postMessage('stop');
        ws.send(JSON.stringify({
            type: "stopStream",
            text: ""
        }));
    }
} 
// Converts Float32Array of audio data to PCM16 ArrayBuffer
function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
}
// Converts a Float32Array to base64-encoded PCM16 data
function base64EncodeAudio(float32Array) {
    const arrayBuffer = floatTo16BitPCM(float32Array);
    let binary = '';
    let bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000; // 32KB chunk size
    for (let i = 0; i < bytes.length; i += chunkSize) {
        let chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}
// 音声データをキューに追加
function enqueueAudio(base64AudioData) {
    audioQueue.push(base64AudioData);
    playNextAudio();
}
function addWavHeader(samples, sampleRate, bitDepth, numChannels) {
    const byteRate = (sampleRate * numChannels * bitDepth) / 8;
    const blockAlign = (numChannels * bitDepth) / 8;
    const dataSize = samples.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF チャンク
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true); // ファイル全体のサイズ
    writeString(view, 8, "WAVE");

    // fmt チャンク
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // fmt チャンクのサイズ
    view.setUint16(20, 1, true); // オーディオフォーマット (1 = PCM)
    view.setUint16(22, numChannels, true); // チャンネル数
    view.setUint32(24, sampleRate, true); // サンプルレート
    view.setUint32(28, byteRate, true); // バイトレート
    view.setUint16(32, blockAlign, true); // ブロックアライン
    view.setUint16(34, bitDepth, true); // ビット深度

    // data チャンク
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true); // データサイズ

    // PCM データをコピー
    new Uint8Array(buffer, 44).set(new Uint8Array(samples));

    return buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// キューの次の音声を再生
function playNextAudio() {
    if (isPlaying || audioQueue.length === 0) {
        return; // 再生中かキューが空の場合は処理しない
    }

    // キューから音声データを取り出して再生
    const base64AudioData = audioQueue.shift();  // 最初の音声データを取得
    isPlaying = true;

    // Base64デコードしてArrayBufferに変換
    const binaryData = atob(base64AudioData);  // Base64文字列をデコード
    const arrayBuffer = new ArrayBuffer(binaryData.length);
    const uint8Array = new Uint8Array(arrayBuffer);

    const audioBuffer = Uint8Array.from(binaryData, (c) => c.charCodeAt(0));

    // バイナリデータをUint8Arrayにコピー
    for (let i = 0; i < binaryData.length; i++) {
        uint8Array[i] = binaryData.charCodeAt(i);
    }
    const waveData = addWavHeader(arrayBuffer, samplerate, 16, 1)

    // AudioBufferにデコードして再生
    audioContext.decodeAudioData(waveData, (buffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.onended = () => {
            isPlaying = false;  // 再生終了後、次の音声の再生準備
            playNextAudio();    // 次の音声を再生
        };
        source.start();  // 即座に再生
    }, (error) => {
        console.error('Error decoding audio data', error);
    });
}

// WebSocketメッセージの受信
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "delta.audio") {
        const base64AudioData = data.text;  // Base64エンコードされた音声データ
        enqueueAudio(base64AudioData);  // 音声データをキューに追加    
    }else if (data.type === "delta.text") {
        // 部分応答の更新（リアルタイムでテキストを表示）
        if(partialResponse == ""){
            realtimeMSG = document.createElement("div");
            messagesDiv.appendChild(realtimeMSG);
        }
        partialResponse += data.text;
        realtimeMSG.textContent = `ChatGPT: ${partialResponse}`;
        messagesDiv.scrollTop = messagesDiv.scrollHeight; // スクロールを最下部に
    }else if (data.type === "final.text") {
        partialResponse = ""; // 次のメッセージのためにリセット
        //入力用divを挿入してaudio/text入力を待機
        if(finalInput == "") {
            inputMSG = document.createElement("div");
            messagesDiv.appendChild(inputMSG);
        }
    }else if(data.type === "final.audio") {
        if(finalInput == "") {
            inputMSG.textContent = `you: ${data.text}`;
            messagesDiv.scrolltop = messagesDiv.scrollheight; //最下部スクロール
            finalInput = "";
        }
    }
};

// メッセージを送信
sendButton.addEventListener("click", () => {
    const message = input.value.trim();
    if (message) {
        //テキスト入力メッセージを表示
        ws.send(JSON.stringify({
            type : "sendChat",
            text : message,
        }));
        if(finalInput == "") {
            inputMSG.textContent = `you: ${message}`;
            messagesDiv.scrolltop = messagesDiv.scrollheight; //最下部スクロール
            finalInput = "";
        }
        input.value = "";
    }
});

startButton.addEventListener("click", () => {
    ws.send(JSON.stringify({
        type : "startOrder",
        text : "",
    }));
});

// Enterキーで送信
input.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        sendButton.click();
    }
});
startTalk.addEventListener("click", () => {
    startMicrophone();
});
stopTalk.addEventListener("click", () => {
    stopMicrophone();
});

