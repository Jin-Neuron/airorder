class AudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.isActive = true;
        this.bufferSize = options.processorOptions.bufferSize || 128; // デフォルト128
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0; // バッファの現在位置

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
            // 入力データをバッファにコピー
            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.bufferIndex++] = channelData[i];
                // バッファが満杯になったら処理
                if (this.bufferIndex >= this.bufferSize) {
                    this.port.postMessage(this.buffer); // 完成したバッファを送信
                    this.bufferIndex = 0; // バッファ位置をリセット
                }
            }
        }
        return true; // 継続処理
    }
}
registerProcessor('audio-processor', AudioProcessor);
