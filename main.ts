/**
 * MarkLabs IoT: micro:bit gửi số liệu lên https://iot.markpage2k1.me và nhận lệnh từ bảng điều khiển trên trình duyệt,
 * qua mạch Cytron Grove WiFi 8266 (firmware ESP-AT v2.2.0).
 *
 * Mạch gọi máy chủ bằng HTTP thường. Ưu tiên lệnh AT+HTTPCLIENT (ESP8266 tự lo header, chỉ trả phần thân);
 * firmware không có lệnh này thì tự lùi về kết nối TCP và tự viết yêu cầu HTTP (có header Host).
 * Cách gửi lệnh AT học từ extension pxt-esp8266 của Cytron Technologies (MIT).
 */

/** Chân ảo V0–V9: mỗi chân là một ô số liệu trên bảng điều khiển. */
enum VirtualPin {
    //% block="V0"
    V0 = 0,
    //% block="V1"
    V1 = 1,
    //% block="V2"
    V2 = 2,
    //% block="V3"
    V3 = 3,
    //% block="V4"
    V4 = 4,
    //% block="V5"
    V5 = 5,
    //% block="V6"
    V6 = 6,
    //% block="V7"
    V7 = 7,
    //% block="V8"
    V8 = 8,
    //% block="V9"
    V9 = 9,
}

//% weight=90 color=#18a6a6 icon="" block="MarkLabs IoT"
//% groups='["Kết nối", "Gửi lên", "Đọc về"]'
namespace marklabsIot {
    const OK = "\r\nOK\r\n"
    const ERROR = "\r\nERROR\r\n"
    const FAIL = "\r\nFAIL\r\n"
    const HEX = "0123456789ABCDEF"

    let server = "iot.markpage2k1.me"
    let projectCode = ""
    /** 0: chưa biết, 1: AT+HTTPCLIENT, 2: TCP tự viết HTTP. */
    let mode = 0
    let wifiConnected = false
    let lastOk = false
    /** Hai khối mạng chạy cùng lúc (vd "mãi mãi" và "khi nút A được bấm") phải chờ nhau, không thì lệnh AT lẫn vào nhau. */
    let busy = false
    /** Dữ liệu UART nhận được từ lệnh AT đang chạy. */
    let uart = ""

    /* ---------- Lệnh AT ---------- */

    function flush(): void {
        serial.readString()
        uart = ""
    }

    /** Đọc UART tới khi thấy một trong các chữ cần chờ; hết giờ thì trả chuỗi rỗng. Dữ liệu đã đọc nằm trong `uart`. */
    function waitFor(words: string[], timeout: number): string {
        const start = control.millis()
        while (control.millis() - start < timeout) {
            uart += serial.readString()
            for (const word of words) {
                if (uart.includes(word)) return word
            }
            basic.pause(1)
        }
        return ""
    }

    function command(cmd: string, timeout: number): boolean {
        flush()
        serial.writeString(cmd + "\r\n")
        return waitFor([OK, ERROR, FAIL], timeout) == OK
    }

    /** Chuỗi trong lệnh AT: thoát dấu \ , " và dấu phẩy. */
    function atString(text: string): string {
        return text.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll(",", "\\,")
    }

    function percent(byte: number): string {
        return "%" + HEX.charAt(byte >> 4) + HEX.charAt(byte & 15)
    }

    /** Mã hoá giá trị để đặt vào URL (UTF-8, giữ nguyên chữ cái, chữ số và - . _ ~). */
    function encode(text: string): string {
        let out = ""
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i)
            if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c == 45 || c == 46 || c == 95 || c == 126) {
                out += text.charAt(i)
            } else if (c < 0x80) {
                out += percent(c)
            } else if (c < 0x800) {
                out += percent(0xC0 | (c >> 6)) + percent(0x80 | (c & 63))
            } else if (c < 0x10000) {
                out += percent(0xE0 | (c >> 12)) + percent(0x80 | ((c >> 6) & 63)) + percent(0x80 | (c & 63))
            } else {
                out += percent(0xF0 | (c >> 18)) + percent(0x80 | ((c >> 12) & 63)) + percent(0x80 | ((c >> 6) & 63)) + percent(0x80 | (c & 63))
            }
        }
        return out
    }

    /* ---------- HTTP ---------- */

    /** Cách 1: AT+HTTPCLIENT trả "+HTTPCLIENT:<độ dài>,<thân>" rồi OK. Thân rỗng thì không có dòng đó. */
    function viaHttpClient(path: string): string {
        lastOk = command("AT+HTTPCLIENT=2,0,\"http://" + server + path + "\",,,1", 10000)
        if (!lastOk) return ""
        const tag = "+HTTPCLIENT:"
        const at = uart.indexOf(tag)
        if (at < 0) return ""
        const body = uart.substr(uart.indexOf(",", at) + 1)
        const end = body.indexOf("\r\n")
        return end < 0 ? body : body.substr(0, end)
    }

    /** Bỏ các dấu "\r\n+IPD,<n>:" ESP8266 chèn trước mỗi gói TCP, còn lại đúng phản hồi HTTP. */
    function stripIpd(text: string): string {
        let out = ""
        let from = 0
        while (true) {
            const at = text.indexOf("+IPD,", from)
            const colon = at < 0 ? -1 : text.indexOf(":", at)
            if (colon < 0) return out + text.substr(from)
            let cut = at
            if (cut - from >= 2 && text.substr(cut - 2, 2) == "\r\n") cut -= 2
            out += text.substr(from, cut - from)
            from = colon + 1
        }
    }

    /** Cách 2: tự mở TCP và viết yêu cầu HTTP; máy chủ đóng kết nối sau phản hồi (Connection: close). */
    function viaTcp(path: string): string {
        lastOk = false
        command("AT+CIPCLOSE", 500)
        // Máy chủ có thể kèm cổng ("192.168.1.10:5190"); header Host giữ nguyên cả cổng.
        const colon = server.indexOf(":")
        const host = colon < 0 ? server : server.substr(0, colon)
        const port = colon < 0 ? "80" : server.substr(colon + 1)
        if (!command("AT+CIPSTART=\"TCP\",\"" + host + "\"," + port, 8000)) return ""
        const request = "GET " + path + " HTTP/1.1\r\nHost: " + server + "\r\nConnection: close\r\n\r\n"
        if (!command("AT+CIPSEND=" + request.length, 3000)) return ""
        waitFor([">"], 1000)
        flush()
        serial.writeString(request)
        if (waitFor(["CLOSED\r\n"], 10000) == "") {
            command("AT+CIPCLOSE", 500)
            return ""
        }
        const text = stripIpd(uart)
        const head = text.indexOf("HTTP/1.1 ")
        if (head < 0 || text.substr(head + 9, 3) != "200") return ""
        const start = text.indexOf("\r\n\r\n", head)
        if (start < 0) return ""
        let body = text.substr(start + 4)
        const closed = body.indexOf("CLOSED\r\n")
        if (closed >= 0) body = body.substr(0, closed)
        while (body.length > 0 && (body.charAt(body.length - 1) == "\n" || body.charAt(body.length - 1) == "\r")) {
            body = body.substr(0, body.length - 1)
        }
        lastOk = true
        return body
    }

    /** Thử AT+HTTPCLIENT trước, không được thì TCP. Cả hai đều hỏng thì lần sau thử lại. */
    function detect(): void {
        mode = 1
        if (viaHttpClient("/ping") == "pong") return
        mode = 2
        if (viaTcp("/ping") == "pong") return
        mode = 0
    }

    function request(path: string): string {
        while (busy) basic.pause(20)
        busy = true
        if (mode == 0) detect()
        let body = ""
        if (mode == 1) body = viaHttpClient(path)
        else if (mode == 2) body = viaTcp(path)
        else lastOk = false
        busy = false
        return body
    }

    function ready(): boolean {
        lastOk = false
        return wifiConnected && projectCode.length > 0
    }

    function send(pin: number, value: string): void {
        if (!ready()) return
        const body = request("/w/" + projectCode + "?v" + pin + "=" + encode(value))
        lastOk = lastOk && body == "ok"
    }

    /* ---------- Khối ---------- */

    /**
     * Bật mạch WiFi 8266 và kết nối mạng WiFi. Đặt trong "khi bắt đầu"; mất khoảng 5–20 giây.
     * REKA:BIT: cắm mạch WiFi vào cổng Grove P15:P16 (đúng chân mặc định), lắp pin và bật công tắc.
     * @param ssid tên mạng WiFi
     * @param password mật khẩu WiFi
     * @param tx chân micro:bit nối vào RX của mạch WiFi, eg: SerialPin.P16
     * @param rx chân micro:bit nối vào TX của mạch WiFi, eg: SerialPin.P15
     */
    //% blockId=marklabsiot_connect_wifi
    //% block="kết nối WiFi|tên %ssid|mật khẩu %password||Tx %tx|Rx %rx"
    //% tx.defl=SerialPin.P16 rx.defl=SerialPin.P15
    //% expandableArgumentMode="toggle"
    //% group="Kết nối" weight=100
    export function connectWifi(ssid: string, password: string, tx: SerialPin = SerialPin.P16, rx: SerialPin = SerialPin.P15): void {
        while (busy) basic.pause(20)
        busy = true
        serial.redirect(tx, rx, BaudRate.BaudRate115200)
        serial.setTxBufferSize(128)
        // Phản hồi qua Cloudflare dài khoảng 600 byte: bộ đệm nhận lớn nhất có thể để không rớt chữ.
        serial.setRxBufferSize(254)
        wifiConnected = false
        mode = 0
        // Đặt lại mạch về mặc định (xoá cấu hình cũ của chương trình khác), chờ mạch khởi động lại.
        flush()
        serial.writeString("AT+RESTORE\r\n")
        waitFor(["ready"], 5000)
        command("ATE0", 1000)
        command("AT+CWMODE=1", 1000)
        wifiConnected = command("AT+CWJAP=\"" + atString(ssid) + "\",\"" + atString(password) + "\"", 20000)
        if (wifiConnected) detect()
        busy = false
    }

    /**
     * Mã dự án thầy cô phát cho nhóm (8 chữ, xem trên phiếu hoặc trang giáo viên).
     * @param code mã dự án, eg: "abcd2345"
     */
    //% blockId=marklabsiot_use_project
    //% block="dùng mã dự án %code"
    //% group="Kết nối" weight=90
    export function useProject(code: string): void {
        projectCode = code.toLowerCase().replaceAll(" ", "").replaceAll("-", "")
    }

    /** Đúng khi mạch đã vào được mạng WiFi. */
    //% blockId=marklabsiot_wifi_connected
    //% block="WiFi đã kết nối"
    //% group="Kết nối" weight=80
    export function isWifiConnected(): boolean {
        return wifiConnected
    }

    /** Đúng khi lần gửi hay đọc gần nhất thành công. */
    //% blockId=marklabsiot_last_ok
    //% block="gửi, đọc vừa rồi thành công"
    //% group="Kết nối" weight=70
    export function succeeded(): boolean {
        return lastOk
    }

    /**
     * Gửi một số lên chân ảo, bảng điều khiển hiện ngay. Mỗi lần gửi mất khoảng 1–2 giây.
     * @param value số cần gửi, eg: 0
     * @param pin chân ảo
     */
    //% blockId=marklabsiot_send_number
    //% block="gửi số %value lên chân %pin"
    //% group="Gửi lên" weight=60
    export function sendNumber(value: number, pin: VirtualPin): void {
        send(pin, "" + value)
    }

    /**
     * Gửi chữ lên chân ảo.
     * @param text chữ cần gửi, eg: "Xin chào"
     * @param pin chân ảo
     */
    //% blockId=marklabsiot_send_text
    //% block="gửi chữ %text lên chân %pin"
    //% group="Gửi lên" weight=59
    export function sendText(text: string, pin: VirtualPin): void {
        send(pin, text)
    }

    /**
     * Đọc chữ trên chân ảo (vd từ ô chữ trên bảng điều khiển). Chân chưa có gì hoặc đọc không được thì ra chữ rỗng.
     * @param pin chân ảo
     */
    //% blockId=marklabsiot_read_text
    //% block="đọc chữ từ chân %pin"
    //% group="Đọc về" weight=50
    export function readText(pin: VirtualPin): string {
        if (!ready()) return ""
        const body = request("/r/" + projectCode + "/v" + pin)
        // Máy chủ đặt dấu = trước giá trị; thiếu dấu này là thân báo lỗi.
        if (!lastOk || body.charAt(0) != "=") {
            lastOk = false
            return ""
        }
        return body.substr(1)
    }

    /**
     * Đọc số trên chân ảo (vd từ nút nhấn, công tắc, thanh trượt). Không phải số hoặc đọc không được thì ra 0.
     * @param pin chân ảo
     */
    //% blockId=marklabsiot_read_number
    //% block="đọc số từ chân %pin"
    //% group="Đọc về" weight=49
    export function readNumber(pin: VirtualPin): number {
        const text = readText(pin)
        if (text.length == 0) return 0
        const n = parseFloat(text)
        return isNaN(n) ? 0 : n
    }

    /**
     * Đổi máy chủ (chỉ dùng khi thử máy chủ trên máy tính trong mạng LAN, vd "192.168.1.10:5190").
     * @param host tên máy chủ, eg: "iot.markpage2k1.me"
     */
    //% blockId=marklabsiot_set_server
    //% block="đặt máy chủ %host"
    //% advanced=true
    export function setServer(host: string): void {
        server = host
        mode = 0
    }

    /** Cách mạch đang gọi mạng: "HTTPCLIENT", "TCP" hoặc "?" (chưa gọi được). Dùng khi gỡ lỗi. */
    //% blockId=marklabsiot_transport
    //% block="cách gọi mạng"
    //% advanced=true
    export function transport(): string {
        if (mode == 1) return "HTTPCLIENT"
        if (mode == 2) return "TCP"
        return "?"
    }
}
