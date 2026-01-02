import deviceManager from '../../device/deviceManager.js';

Page({
    data: {
        deviceList: [], // 页面渲染的核心数据源
        isEmpty: true   // 用于控制缺省页显示
    },

    /**
     * 页面显示时触发
     * 每次返回首页都要刷新数据，确保状态最新
     */
    onShow() {
        this.updateList();
    },

    /**
     * 从 Manager 获取最新数据并更新 UI
     */
    updateList() {
        const list = deviceManager.getAllDevices();
        this.setData({
            deviceList: list,
            isEmpty: list.length === 0
        });
    },

    /**
     * 点击添加按钮
     */
    onAddDevice() {
        wx.vibrateShort({
            type: 'light'
        });
        wx.navigateTo({
            url: '/pages/addDevice/addDevice'
        });
    },

    /**
     * 点击设备卡片进入详情
     */
    onDeviceTap(e) {
        const deviceId = e.currentTarget.dataset.id;
        console.log('进入详情页:', deviceId);
        // wx.navigateTo({ url: `/pages/detail/detail?id=${deviceId}` });
    },

    /**
     * 点击开关按钮 (阻止冒泡，不进入详情)
     */
    onSwitchTap(e) {
        // 阻止冒泡，防止触发 onDeviceTap
        // catchtap 在 wxml 中使用
        const index = e.currentTarget.dataset.index;
        const device = this.data.deviceList[index];

        if (!device) {
            return;
        }

        wx.vibrateShort({
            type: 'medium'
        });

        // 1. 调用业务管家执行开关逻辑 (发蓝牙+改状态)
        deviceManager.toggleDeviceSwitch(device.deviceId);

        // 2. 立即刷新 UI (因为 Manager 已经更新了内存数据)
        this.updateList();
    },

    /**
     * 长按删除设备
     */
    /**
     * 长按菜单：重命名 / 删除
     */
    onDeviceLongPress(e) {
        const index = e.currentTarget.dataset.index;
        const device = this.data.deviceList[index];

        if (!device) return;

        wx.vibrateShort({ type: 'heavy' });

        wx.showActionSheet({
            itemList: ['重命名', '删除设备'], // 选项列表
            // itemColor: '#000000', // 默认黑色，如果要删除变红需要自定义组件，原生不支持单独变色
            success: async (res) => {

                // 重命名
                if (res.tapIndex === 0) {
                    wx.showModal({
                        title: '重命名设备',
                        content: device.name, // 默认显示旧名字
                        editable: true,       // 开启输入框
                        placeholderText: '请输入新名称',
                        success: (modalRes) => {
                            if (modalRes.confirm && modalRes.content) {
                                const newName = modalRes.content.trim();
                                if (newName.length > 0) {
                                    deviceManager.updateDeviceName(device.deviceId, newName);
                                    this.updateList();
                                    wx.showToast({ title: '已更名', icon: 'none' });
                                }
                            }
                        }
                    });
                } else if (res.tapIndex === 1) {
                    // 删除设备
                    wx.showModal({
                        title: '确认删除',
                        content: `确定要删除设备“${device.name}”吗？`,
                        confirmColor: '#FF3B30', // 确认按钮标红
                        success: async (modalRes) => {
                            if (modalRes.confirm) {
                                await deviceManager.removeDevice(device.deviceId);
                                this.updateList();
                                wx.showToast({ title: '已删除', icon: 'success' });
                            }
                        }
                    });
                }
            },
            fail: (res) => {
                console.log(res.errMsg);
            }
        });
    },

    onPullDownRefresh() {
        this.updateList();
        wx.stopPullDownRefresh();
    }
});