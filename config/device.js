// config/device.js

const config = {
    app_version:[0xAA, 0x01],

  // 厂商ID：0x41, 0x47
  company_id: [0x41, 0x47], 

  types: {
    0x01: { name: '灯带', icon: '🌈' , opcode: 0x01},
  }
};

module.exports = config;