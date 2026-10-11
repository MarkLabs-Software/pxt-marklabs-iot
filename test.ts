// Chương trình mẫu: gửi số đếm lên V0, đọc V1 về hiện lên màn LED. Hỏng thì hiện mã lỗi (✗ rồi một chữ số).
marklabsIot.connectWifi("TenWiFi", "MatKhau")
marklabsIot.useProject("abcd2345")
let n = 0
basic.forever(function () {
    if (!marklabsIot.isWifiConnected()) {
        marklabsIot.showError()
        return
    }
    n += 1
    marklabsIot.sendNumber(n, VirtualPin.V0)
    if (!marklabsIot.succeeded()) {
        marklabsIot.showError()
        return
    }
    basic.showNumber(marklabsIot.readNumber(VirtualPin.V1))
})
