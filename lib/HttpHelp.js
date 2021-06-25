const request = require('request')

module.exports = (请求类型, 地址, 参数 = {}) => {
    return new Promise((pres, rej) => {
        request({
            url: 地址,
            method: 请求类型,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(参数)
        }, (err, res, body) => {
            if (err) return rej(err)
            pres({ res, body })
        })
    })
}
