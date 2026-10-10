// Chương trình mẫu: gửi nhiệt độ lên V0, đọc nút nhấn trên bảng điều khiển ở V1 để bật tắt hình trái tim.
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
