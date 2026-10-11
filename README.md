# MarkLabs IoT cho micro:bit

Extension MakeCode để micro:bit cùng mạch **Cytron Grove WiFi 8266** gửi số liệu lên bảng điều khiển [MarkLabs IoT](https://iot.marklabs.workers.dev) và nhận lệnh từ bảng điều khiển trên trình duyệt. Không cần tài khoản Blynk.

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
| `gửi số … lên chân V0` | Gửi một số lên chân ảo V0–V9. Khối không chờ mạng: số mới nhất được gửi ở lần đồng bộ sau. |
| `gửi chữ … lên chân V0` | Gửi chữ. |
| `đọc số từ chân V1` | Đọc số do bảng điều khiển gửi xuống (nút nhấn, công tắc, thanh trượt). Khối không chờ mạng: trả số của lần đồng bộ gần nhất. |
| `đọc chữ từ chân V1` | Đọc chữ (ô chữ trên bảng điều khiển). |
| `gửi, đọc vừa rồi thành công` | Đúng khi lần gửi hay đọc gần nhất thành công. |
| `hiện mã lỗi` | Hiện dấu ✗ rồi một chữ số 1–9 đứng yên trên màn LED. Tra nghĩa ở [bảng mã lỗi](#bảng-mã-lỗi). Không có lỗi thì hiện ✓. |
| `mã lỗi` | Mã lỗi gần nhất (1–9), 0 là không có lỗi. |

Mạch **đồng bộ** với bảng điều khiển theo nhịp: 2 giây một lần khi có người đang mở bảng, 10 giây khi không ai mở. Mỗi nhịp là một lần gọi lên máy chủ, gửi mọi chân vừa đổi và đọc mọi chân chương trình có đọc. Số thay đổi nhanh hơn nhịp thì bảng chỉ thấy số mới nhất của mỗi lần.

## Bảng mã lỗi

Khi hỏng, khối `hiện mã lỗi` cho màn LED hiện dấu ✗ <img src="images/loi-x.svg" width="24" alt="dấu ✗"> rồi một chữ số đứng yên. Tìm chữ số đó trong bảng:

| Màn LED | Mã | Nghĩa là | Cách sửa |
|:---:|:---:|---|---|
| <img src="images/loi-1.svg" width="48" alt="mã 1"> | **1** | Không thấy mạch WiFi: micro:bit hỏi mà mạch WiFi không trả lời. | Lắp pin và gạt công tắc REKA:BIT sang **ON** (chỉ cắm USB thì không đủ điện). Cắm cáp Grove chắc vào cổng **P15:P16**. Nhấn nút Reset trên mạch WiFi rồi nạp lại chương trình. |
| <img src="images/loi-2.svg" width="48" alt="mã 2"> | **2** | Không thấy mạng WiFi. | Gõ đúng tên WiFi (phân biệt chữ hoa, chữ thường). Mạch chỉ bắt được WiFi **2,4 GHz**: cục phát có mạng "…5G" thì chọn mạng kia. |
| <img src="images/loi-3.svg" width="48" alt="mã 3"> | **3** | Sai mật khẩu WiFi. | Gõ lại mật khẩu, chú ý chữ hoa, chữ thường. |
| <img src="images/loi-4.svg" width="48" alt="mã 4"> | **4** | Không vào được WiFi: sóng yếu, cục phát không trả lời, hoặc WiFi phải đăng nhập qua trang web (trường học, quán cà phê). | Mang mạch lại gần cục phát. Thử phát WiFi từ điện thoại. |
| <img src="images/loi-5.svg" width="48" alt="mã 5"> | **5** | Vào WiFi rồi nhưng không gọi được máy chủ: mạng không ra được Internet, hoặc chặn. | Thử phát WiFi từ điện thoại. Mở `iot.marklabs.workers.dev` trên điện thoại cùng mạng xem có vào được không. |
| <img src="images/loi-6.svg" width="48" alt="mã 6"> | **6** | Chưa có mã dự án. | Thêm khối `dùng mã dự án` vào "khi bắt đầu", gõ mã 8 chữ của nhóm. |
| <img src="images/loi-7.svg" width="48" alt="mã 7"> | **7** | Sai mã dự án: gõ sai, hoặc thầy cô đã đổi mã hay xoá dự án. | Xem lại mã trên phiếu, hoặc hỏi thầy cô mã mới. |
| <img src="images/loi-8.svg" width="48" alt="mã 8"> | **8** | Mạng chập chờn lúc gửi hay đọc. | Lần sau thường tự được. Hiện mãi thì kiểm pin (pin yếu làm mạch WiFi tắt) và mang lại gần cục phát. |
| <img src="images/loi-9.svg" width="48" alt="mã 9"> | **9** | Chưa kết nối WiFi: khối `kết nối WiFi` chưa chạy. | Đặt `kết nối WiFi` lên đầu trong "khi bắt đầu", trước mọi khối gửi, đọc. |

Muốn đọc lý do bằng chữ (không dấu) thì dùng khối nâng cao `lỗi gần nhất (chữ)`.

## Ví dụ

```blocks
marklabsIot.connectWifi("TenWiFi", "MatKhau")
marklabsIot.useProject("abcd2345")
let n = 0
basic.forever(function () {
    n += 1
    marklabsIot.sendNumber(n, VirtualPin.V0)
    if (marklabsIot.errorCode() > 0) {
        marklabsIot.showError()
    } else {
        basic.showNumber(marklabsIot.readNumber(VirtualPin.V1))
    }
})
```

## Cách hoạt động

Một luồng nền gọi máy chủ bằng HTTP thường (cổng 80), mỗi nhịp đúng một yêu cầu:

- `GET /s/<mã>?v0=25&v3=abc&r=15` → `=2⇥7⇥hello` (⇥ là dấu tab): gửi V0, V3; đọc V1, V5. Số đầu là nhịp lần sau (giây), máy chủ quyết; dấu `=` đứng đầu nghĩa là được.
- Chân không đổi thì 10 giây mới gửi nhắc lại một lần. Chương trình chưa gửi, chưa đọc gì thì không gọi lên.

Gọi bằng kết nối TCP, tự viết yêu cầu HTTP (đã chạy trên mạch thật). Không được thì thử lệnh `AT+HTTPCLIENT` của firmware. Khối nâng cao `cách gọi mạng` cho biết đang dùng cách nào.

Gọi tay để thử: mở `http://iot.marklabs.workers.dev/w/<mã>?v1=7` trên trình duyệt để gửi số 7 xuống chân V1.

Hình chữ số của từng mã lỗi vẽ trong hàm `errorImage` (main.ts). Sửa hình thì chạy `node scripts/error-icons.mjs` để vẽ lại các ảnh trong `images/`.

Cách gửi lệnh AT học từ [pxt-esp8266](https://github.com/CytronTechnologies/pxt-esp8266) của Cytron Technologies (MIT).

## Giấy phép

MIT

#### Metadata (used for search, rendering)

* for PXT/microbit
<script src="https://makecode.com/gh-pages-embed.js"></script><script>makeCodeRender("{{ site.makecode.home_url }}", "{{ site.github.owner_name }}/{{ site.github.repository_name }}");</script>
