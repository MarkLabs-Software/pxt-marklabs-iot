/**
 * MarkLabs IoT: micro:bit gửi số liệu lên bảng điều khiển trên trình duyệt và nhận lệnh từ đó, qua mạch Cytron Grove WiFi 8266
 * (firmware ESP-AT v2.2.0). Máy chủ chạy trên Cloudflare Workers (tài khoản riêng của MarkLabs IoT, tên miền workers.dev).
 *
 * Mạch gọi máy chủ bằng HTTP thường, theo nhịp (xem "Đồng bộ theo nhịp"): mỗi nhịp đúng một yêu cầu, gửi và đọc cùng lúc.
 * Gọi mạng bằng kết nối TCP tự viết yêu cầu HTTP (có header Host); firmware có AT+HTTPCLIENT thì dùng được làm cách thứ hai.
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
    // Dòng kết quả của lệnh AT. `uart` luôn bắt đầu bằng "\n" nên dòng đầu tiên cũng khớp.
    const OK = "\nOK\r\n"
    const ERROR = "\nERROR\r\n"
    const FAIL = "\nFAIL\r\n"
    const HEX = "0123456789ABCDEF"

    /** Máy chủ: Worker `iot` ở tài khoản Cloudflare riêng của MarkLabs IoT. */
    let server = "iot.marklabs-iot.workers.dev"
    let projectCode = ""
    /** 0: chưa biết, 1: AT+HTTPCLIENT, 2: TCP tự viết HTTP. */
    let mode = 0
    let wifiConnected = false
    let lastOk = false
    /**
     * Mã lỗi gần nhất, 0 là không có lỗi. Bảng mã nằm ở README (mục "Bảng mã lỗi"), hình của từng mã vẽ trong `errorImage`.
     * Đổi nghĩa một mã thì sửa cả README và chạy lại `node scripts/error-icons.mjs`.
     */
    let lastError = 0
    const NO_BOARD = 1
    const NO_NETWORK = 2
    const BAD_PASSWORD = 3
    const CANNOT_JOIN = 4
    const NO_SERVER = 5
    const NO_PROJECT = 6
    const BAD_PROJECT = 7
    const NETWORK_GLITCH = 8
    const NOT_CONNECTED = 9
    /** Câu không dấu của từng mã (chỉ số = mã), cho khối "lỗi gần nhất". */
    const ERROR_TEXTS = [
        "",
        "khong thay mach WiFi: kiem cong P15:P16, pin, cong tac",
        "khong thay WiFi (ten sai hoac 5GHz)",
        "sai mat khau WiFi",
        "khong vao duoc WiFi",
        "vao WiFi roi nhung khong goi duoc may chu",
        "chua co ma du an",
        "sai ma du an",
        "loi mang, thu lai",
        "chua ket noi WiFi",
    ]
    /** Hai khối mạng chạy cùng lúc (vd "mãi mãi" và "khi nút A được bấm") phải chờ nhau, không thì lệnh AT lẫn vào nhau. */
    let busy = false
    /** Dữ liệu UART nhận được từ lệnh AT đang chạy. */
    let uart = ""

    /* ---------- Lệnh AT ---------- */

    function flush(): void {
        serial.readString()
        uart = "\n"
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

    /**
     * Chọn cách gọi mạng. Thử TCP trước: đã chạy trên mạch thật (Grove WiFi 8266 + REKA:BIT, 11/10/2026), còn AT+HTTPCLIENT
     * trên firmware của Cytron thì chưa. Cả hai đều hỏng thì lần sau thử lại.
     */
    function detect(): void {
        mode = 2
        if (viaTcp("/ping") == "pong") return
        mode = 1
        if (viaHttpClient("/ping") == "pong") return
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
        if (!lastOk) lastError = mode == 0 ? NO_SERVER : NETWORK_GLITCH
        return body
    }

    /* ---------- Đồng bộ theo nhịp ---------- */
    // Khối gửi chỉ ghi nhớ số, khối đọc trả số của lần đồng bộ gần nhất: không khối nào phải chờ mạng.
    // Một luồng nền gom mọi chân cần gửi và cần đọc vào một yêu cầu `/s/<mã>?v0=..&r=15`, theo nhịp máy chủ báo
    // (2 giây khi có người mở bảng điều khiển, 10 giây khi không ai mở): cả lớp gọi lên ít hơn nhiều lần so với gọi từng khối.

    /** Chân không đổi thì cứ 10 giây gửi nhắc lại một lần (bảng điều khiển biết số vẫn còn đúng). */
    const RESEND_MS = 10000
    const outValue: string[] = ["", "", "", "", "", "", "", "", "", ""]
    const outUsed: boolean[] = [false, false, false, false, false, false, false, false, false, false]
    const outDirty: boolean[] = [false, false, false, false, false, false, false, false, false, false]
    const outSentAt: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const inUsed: boolean[] = [false, false, false, false, false, false, false, false, false, false]
    const inValue: string[] = ["", "", "", "", "", "", "", "", "", ""]
    let syncMs = 2000
    let syncSoon = false
    let loopStarted = false

    function syncOnce(): void {
        const now = control.millis()
        let query = ""
        const sentPins: number[] = []
        const sentValues: string[] = []
        for (let p = 0; p < 10; p++) {
            if (outUsed[p] && (outDirty[p] || now - outSentAt[p] >= RESEND_MS)) {
                query += "&v" + p + "=" + encode(outValue[p])
                sentPins.push(p)
                sentValues.push(outValue[p])
            }
        }
        const readPins: number[] = []
        let reads = ""
        for (let p = 0; p < 10; p++) {
            if (inUsed[p]) {
                readPins.push(p)
                reads += p
            }
        }
        if (reads.length > 0) query += "&r=" + reads
        const body = request("/s/" + projectCode + (query.length > 0 ? "?" + query.substr(1) : ""))
        if (!lastOk) return
        // Thân trả về: "=<nhịp giây>\t<giá trị chân đọc 1>\t<giá trị chân đọc 2>…"; thiếu dấu "=" là thân báo lỗi.
        if (body.charAt(0) != "=") {
            lastOk = false
            lastError = body == "sai ma" ? BAD_PROJECT : NETWORK_GLITCH
            return
        }
        const parts = body.substr(1).split("\t")
        const seconds = parseInt(parts[0])
        if (seconds >= 1 && seconds <= 60) syncMs = seconds * 1000
        for (let i = 0; i < readPins.length; i++) inValue[readPins[i]] = i + 1 < parts.length ? parts[i + 1] : ""
        for (let i = 0; i < sentPins.length; i++) {
            const p = sentPins[i]
            outSentAt[p] = now
            // Chương trình đổi số trong lúc đang gửi thì lần sau gửi tiếp.
            if (outValue[p] == sentValues[i]) outDirty[p] = false
        }
        lastError = 0
    }

    /** Luồng nền: đồng bộ theo nhịp; có chân mới cần đọc thì đồng bộ sớm. Chương trình chưa gửi, chưa đọc gì thì không gọi lên. */
    function startLoop(): void {
        if (loopStarted) return
        loopStarted = true
        control.inBackground(function () {
            while (true) {
                let used = false
                for (let p = 0; p < 10; p++) if (outUsed[p] || inUsed[p]) used = true
                if (!wifiConnected) {
                    lastOk = false
                } else if (projectCode.length == 0) {
                    lastOk = false
                    lastError = NO_PROJECT
                } else if (used) {
                    syncOnce()
                }
                const until = control.millis() + syncMs
                while (control.millis() < until && !syncSoon) basic.pause(100)
                syncSoon = false
            }
        })
    }

    /** Khối gửi, đọc mà chưa có khối "kết nối WiFi" chạy trước thì báo mã 9. */
    function checkStarted(): void {
        if (!loopStarted) {
            lastOk = false
            lastError = NOT_CONNECTED
        }
    }

    function setOut(pin: number, value: string): void {
        checkStarted()
        if (!outUsed[pin] || outValue[pin] != value) {
            outValue[pin] = value
            outDirty[pin] = true
        }
        outUsed[pin] = true
    }

    /** Mã lỗi của AT+CWJAP ("+CWJAP:<mã>": 1 hết giờ, 2 sai mật khẩu, 3 không thấy mạng, 4 không vào được) ra mã lỗi của extension. */
    function wifiError(): number {
        const at = uart.indexOf("+CWJAP:")
        const code = at < 0 ? "" : uart.charAt(at + 7)
        if (code == "2") return BAD_PASSWORD
        if (code == "3") return NO_NETWORK
        return CANNOT_JOIN
    }

    /**
     * Hình của từng mã lỗi: chữ số 3×5 ở giữa màn LED, không chạy chữ nên dễ nhìn.
     * README vẽ lại đúng các hình này (`node scripts/error-icons.mjs` đọc thẳng file này).
     */
    function errorImage(code: number): Image {
        switch (code) {
            case 1: return images.createImage(`
                . . # . .
                . # # . .
                . . # . .
                . . # . .
                . # # # .
                `)
            case 2: return images.createImage(`
                . # # # .
                . . . # .
                . # # # .
                . # . . .
                . # # # .
                `)
            case 3: return images.createImage(`
                . # # # .
                . . . # .
                . . # # .
                . . . # .
                . # # # .
                `)
            case 4: return images.createImage(`
                . # . # .
                . # . # .
                . # # # .
                . . . # .
                . . . # .
                `)
            case 5: return images.createImage(`
                . # # # .
                . # . . .
                . # # # .
                . . . # .
                . # # # .
                `)
            case 6: return images.createImage(`
                . # # # .
                . # . . .
                . # # # .
                . # . # .
                . # # # .
                `)
            case 7: return images.createImage(`
                . # # # .
                . . . # .
                . . # . .
                . . # . .
                . . # . .
                `)
            case 8: return images.createImage(`
                . # # # .
                . # . # .
                . # # # .
                . # . # .
                . # # # .
                `)
            default: return images.createImage(`
                . # # # .
                . # . # .
                . # # # .
                . . . # .
                . # # # .
                `)
        }
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
        lastError = 0
        // Đặt lại mạch về mặc định (xoá cấu hình cũ của chương trình khác), chờ mạch khởi động lại.
        flush()
        serial.writeString("AT+RESTORE\r\n")
        waitFor(["ready"], 5000)
        // Mạch WiFi có trả lời không: hỏi "AT" vài lần (lúc vừa bật nguồn mạch có thể chưa sẵn sàng).
        let alive = false
        for (let i = 0; i < 5 && !alive; i++) alive = command("AT", 1000)
        if (!alive) {
            lastError = NO_BOARD
            busy = false
            return
        }
        command("ATE0", 1000)
        command("AT+CWMODE=1", 1000)
        wifiConnected = command("AT+CWJAP=\"" + atString(ssid) + "\",\"" + atString(password) + "\"", 20000)
        if (!wifiConnected) {
            lastError = wifiError()
        } else {
            detect()
            if (mode == 0) lastError = NO_SERVER
        }
        busy = false
        startLoop()
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

    /** Đúng khi lần đồng bộ gần nhất với máy chủ thành công. */
    //% blockId=marklabsiot_last_ok
    //% block="gửi, đọc vừa rồi thành công"
    //% group="Kết nối" weight=70
    export function succeeded(): boolean {
        return lastOk
    }

    /**
     * Hiện mã lỗi lên màn LED: dấu ✗ rồi một chữ số 1–9 đứng yên. Tra nghĩa ở bảng mã lỗi trong README của extension.
     * Không có lỗi thì hiện dấu ✓.
     */
    //% blockId=marklabsiot_show_error
    //% block="hiện mã lỗi"
    //% group="Kết nối" weight=66
    export function showError(): void {
        if (lastError == 0) {
            basic.showIcon(IconNames.Yes)
            return
        }
        basic.showIcon(IconNames.No, 400)
        errorImage(lastError).showImage(0, 1000)
    }

    /** Mã lỗi gần nhất (1–9), 0 là không có lỗi. Nghĩa từng mã: bảng mã lỗi trong README của extension. */
    //% blockId=marklabsiot_error_code
    //% block="mã lỗi"
    //% group="Kết nối" weight=65
    export function errorCode(): number {
        return lastError
    }

    /** Câu không dấu của mã lỗi gần nhất, vd "sai mat khau WiFi". Rỗng là không có lỗi. */
    //% blockId=marklabsiot_last_error
    //% block="lỗi gần nhất (chữ)"
    //% advanced=true
    export function errorText(): string {
        return ERROR_TEXTS[lastError]
    }

    /**
     * Gửi một số lên chân ảo. Khối không phải chờ mạng: mạch gửi số mới nhất ở lần đồng bộ sau (2 giây một lần khi có người mở
     * bảng điều khiển, 10 giây khi không ai mở).
     * @param value số cần gửi, eg: 0
     * @param pin chân ảo
     */
    //% blockId=marklabsiot_send_number
    //% block="gửi số %value lên chân %pin"
    //% group="Gửi lên" weight=60
    export function sendNumber(value: number, pin: VirtualPin): void {
        setOut(pin, "" + value)
    }

    /**
     * Gửi chữ lên chân ảo (gửi ở lần đồng bộ sau, như khối gửi số).
     * @param text chữ cần gửi, eg: "Xin chào"
     * @param pin chân ảo
     */
    //% blockId=marklabsiot_send_text
    //% block="gửi chữ %text lên chân %pin"
    //% group="Gửi lên" weight=59
    export function sendText(text: string, pin: VirtualPin): void {
        setOut(pin, text)
    }

    /**
     * Đọc chữ trên chân ảo (vd từ ô chữ trên bảng điều khiển). Khối không phải chờ mạng: trả chữ của lần đồng bộ gần nhất.
     * Lần đầu đọc một chân thì mạch đồng bộ ngay, trong lúc chờ ra chữ rỗng.
     * @param pin chân ảo
     */
    //% blockId=marklabsiot_read_text
    //% block="đọc chữ từ chân %pin"
    //% group="Đọc về" weight=50
    export function readText(pin: VirtualPin): string {
        checkStarted()
        if (!inUsed[pin]) {
            inUsed[pin] = true
            syncSoon = true
        }
        return inValue[pin]
    }

    /**
     * Đọc số trên chân ảo (vd từ nút nhấn, công tắc, thanh trượt). Không phải số hoặc chưa có thì ra 0.
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
     * @param host tên máy chủ, eg: "192.168.1.10:5190"
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
