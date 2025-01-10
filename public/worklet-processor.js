class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isActive = true;

        // メインスレッドからのメッセージを受信
        this.port.onmessage = (event) => {
        if (event.data === 'stop') {
            this.isActive = false;
        }};
    }
    process(inputs, outputs) {
        if(!this.isActive){
            return false;
        }
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0]; // チャンネル0のデータを取得
            this.port.postMessage(new Float32Array(channelData)); // メインスレッドに送信
        }
        return true; // 継続処理
    }
}
registerProcessor('audio-processor', AudioProcessor);
