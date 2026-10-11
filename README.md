# MarkLabs IoT cho micro:bit

Extension MakeCode để micro:bit cùng mạch **Cytron Grove WiFi 8266** gửi số liệu lên [iot.markpage2k1.me](https://iot.markpage2k1.me) và nhận lệnh từ bảng điều khiển trên trình duyệt. Không cần tài khoản Blynk.

*MakeCode extension for micro:bit + Cytron Grove WiFi 8266 (ESP-AT firmware) talking to the MarkLabs IoT dashboard.*

## Thêm vào MakeCode

1. Mở [makecode.microbit.org](https://makecode.microbit.org), tạo dự án mới.
2. Bấm **Extensions** (Tiện ích mở rộng), dán đường dẫn `https://github.com/MarkLabs-Software/pxt-marklabs-iot`.
3. Mục **MarkLabs IoT** hiện ra trong danh sách khối.

## Nối dây

Với bo **REKA:BIT**: cắm mạch Grove WiFi 8266 vào cổng Grove **P15:P16**, đúng chân mặc định của khối kết nối (Tx = P16, Rx = P15). Lắp pin và gạt công tắc REKA:BIT sang **ON**: chỉ cắm USB vào micro:bit thì không đủ điện cho mạch WiFi.

Cắm vào cổng khác thì bấm dấu + trên khối `kết nối WiFi` để chọn chân: chân Tx là chân ghi sau dấu hai chấm của tên cổng, chân Rx là chân đứng trước (vd cổng P13:P14 thì Tx = P14, Rx = P13). Cổng P1:P9 không dùng được vì micro:bit không đặt UART lên P9.

## Khối

| Khối | Dùng để |
|---|---|
| `kết nối WiFi tên … mật khẩu …` | Bật mạch WiFi và vào mạng. Đặt trong "khi bắt đầu". Mặc định Tx = P16, Rx = P15 (bấm dấu + để đổi). |
| `dùng mã dự án …` | Mã 8 chữ thầy cô phát cho nhóm. |
| `WiFi đã kết nối` | Đúng khi mạch đã vào mạng. |
| `gửi số … lên chân V0` | Gửi một số lên chân ảo V0–V9. Bảng điều khiển hiện ngay. |
| `gửi chữ … lên chân V0` | Gửi chữ. |
| `đọc số từ chân V1` | Đọc số do bảng điều khiển gửi xuống (nút nhấn, công tắc, thanh trượt). |
| `đọc chữ từ chân V1` | Đọc chữ (ô chữ trên bảng điều khiển). |
| `gửi, đọc vừa rồi thành công` | Đúng khi lần gửi hay đọc gần nhất thành công. |

Mỗi lần gửi hoặc đọc mất khoảng 1–2 giây.

## Ví dụ

```blocks
marklabsIot.connectWifi("TenWiFi", "MatKhau")
marklabsIot.useProject("abcd2345")
basic.forever(function () {
    marklabsIot.sendNumber(input.temperature(), VirtualPin.V0)
    if (marklabsIot.readNumber(VirtualPin.V1) == 1) {
        basic.showIcon(IconNames.Heart)
    } else {
        basic.clearScreen()
    }
})
```

## Cách hoạt động

Mạch gọi máy chủ bằng HTTP thường (cổng 80):

- `GET /w/<mã>?v0=25` → `ok`
- `GET /r/<mã>/v0` → `=25` (dấu `=` đứng đầu nghĩa là đọc được)

Extension ưu tiên lệnh `AT+HTTPCLIENT` của firmware ESP-AT v2.2.0. Firmware không có lệnh này thì tự mở kết nối TCP và tự viết yêu cầu HTTP. Khối nâng cao `cách gọi mạng` cho biết đang dùng cách nào.

Cách gửi lệnh AT học từ [pxt-esp8266](https://github.com/CytronTechnologies/pxt-esp8266) của Cytron Technologies (MIT).

## Giấy phép

MIT

#### Metadata (used for search, rendering)

* for PXT/microbit
<script src="https://makecode.com/gh-pages-embed.js"></script><script>makeCodeRender("{{ site.makecode.home_url }}", "{{ site.github.owner_name }}/{{ site.github.repository_name }}");</script>
