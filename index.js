var vscode = require('vscode')
var path = require('path')
var mkdirp = require('mkdirp')
var R = require('ramda')
var gitClone = require('git-clone')
var HttpHelp = require('./lib/HttpHelp')
var { existsSync, promises } = require('fs')
var openExplorer = require('open-file-explorer')
var opn = require('opn')
var clipboardy = require('clipboardy')

var 插件名称 = 'lsby_gitee_vscode_plugin'

var Y = s => s(s)
var 异常 = s => {
    console.error(s)
    throw new Error(s)
}
var 注册树数据提供者 = (id) => {
    var 数据 = []
    var 数据改变事件 = new vscode.EventEmitter()

    vscode.window.registerTreeDataProvider(id, {
        getTreeItem: a => a,
        getChildren: _ => 数据.map(a => {
            var r = vscode.TreeItem(a.显示文本)
            r.id = a.id || a.显示文本
            return r
        }),
        onDidChangeTreeData: 数据改变事件.event
    })
    var r = {
        设置数据: 输入数据 => {
            数据 = 输入数据
            数据改变事件.fire()
            return r
        }
    }
    return r
}
var 获得选择仓库的地址 = (用户仓库信息, 选择仓库) => 用户仓库信息.filter(a => a.id == 选择仓库.id)[0].html_url
var 获得完整本地地址 = (下载位置, 选择仓库) => path.join(下载位置, 选择仓库.label.match(/(?<=\[.*?\]).*/g)[0])
var 注册命令 = (context, 名称, 函数) => context.subscriptions.push(vscode.commands.registerCommand(`${插件名称}.${名称}`, 函数))
var 获得用户仓库信息 = (令牌, 仓库排序选项) => HttpHelp('get', `https://gitee.com/api/v5/user/repos?access_token=${令牌}&sort=${仓库排序选项}&page=1&per_page=100`)
    .then(a => a.body)
    .then(JSON.parse)
var 创建仓库 = (令牌, 名称) => HttpHelp('post', 'https://gitee.com/api/v5/user/repos', { "access_token": 令牌, "name": 名称, "private": "true" })
    .then(a => a.body)
    .then(JSON.parse)
var 执行命令 = (名称, ...参数) => vscode.commands.executeCommand(`${插件名称}.${名称}`, ...参数)
var 提示 = s => vscode.window.showInformationMessage(s)
var 翻译 = s => HttpHelp('get', `https://gitee.com/search/translate?q=${encodeURI(s)}`).then(a => a.body)
    .then(JSON.parse)
    .then(a => a.result)
var 获得用户配置 = _ => [
    { 中文名称: '令牌', 英文名称: 'personal_access_tokens', 处理函数: a => a },
    { 中文名称: '下载位置', 英文名称: 'default_location', 处理函数: a => a == '' || a == null ? `${process.env.HOME || process.env.USERPROFILE}/gitee`.replace(/\\/g, '/') : eval('`' + a.replace(/\\/g, '/') + '`') },
    { 中文名称: '通知自动刷新时间', 英文名称: 'notificationsUpdateTime', 处理函数: a => a },
    { 中文名称: '仓库排序选项', 英文名称: 'repoSort', 处理函数: a => a },
].map(a => ({ [a.中文名称]: a.处理函数(vscode.workspace.getConfiguration(插件名称).get(a.英文名称)) }))
    .reduce((s, a) => Object.assign(s, a), {})
var 获得用户通知 = (令牌) => HttpHelp('get', `https://gitee.com/api/v5/notifications/threads?access_token=${令牌}&type=all&page=1&per_page=20`)
    .then(a => a.body)
    .then(JSON.parse)
var 获得通知地址 = (用户通知信息, 选择通知) => 用户通知信息.filter(a => a.id == 选择通知[0].id)[0].html_url

exports.activate = async function (context) {
    console.log(`"${插件名称}" 已启动`)

    var 用户配置 = 获得用户配置()
    if (用户配置.令牌 == null || 用户配置.令牌 == '') {
        异常('未配置令牌')
    }

    var 用户仓库信息
    var 用户通知信息
    var 界面_我的仓库 = 注册树数据提供者('my_repo')
    var 界面_我的通知 = 注册树数据提供者('my_info')
    var 过滤条件 = ''

    注册命令(context, '刷新通知', async _ => {
        界面_我的通知 = 界面_我的通知.设置数据([{ 显示文本: '加载中...' }])
        用户通知信息 = (await 获得用户通知(用户配置.令牌)).list
        界面_我的通知.设置数据(用户通知信息.map(a => ({ 显示文本: (a.unread ? '[未]' : '[已]') + a.content, id: a.id })))
    })
    注册命令(context, '打开通知在网页', async (...a) => {
        var 地址 = 获得通知地址(用户通知信息, a)
        opn(地址)
    })

    注册命令(context, '刷新仓库', async _ => {
        var 显示数组 = []
        if (过滤条件 != '') {
            显示数组 = [{ 显示文本: '※ 当前的过滤条件: ' + 过滤条件 }]
        }
        界面_我的仓库.设置数据([...显示数组, { 显示文本: '加载中...' }])
        用户仓库信息 = await 获得用户仓库信息(用户配置.令牌, 用户配置.仓库排序选项)
        界面_我的仓库.设置数据([
            ...显示数组,
            ...用户仓库信息.filter(a => a.name.toLowerCase().indexOf(过滤条件.toLowerCase()) != -1)
                .map(a => ({ 显示文本: (a.public ? '[公]' : a.private ? '[私]' : '[未]') + a.name, id: a.id }))
        ])
    })
    注册命令(context, '过滤', async _ => {
        var 输入 = await vscode.window.showInputBox({
            prompt: '请输入你要搜索的内容, 留空为不过滤.',
            placeHolder: '请输入你要搜索的内容, 留空为不过滤.',
            value: 过滤条件,
        })
        if (过滤条件 == null) {
            return
        }
        过滤条件 = 输入.trim()
        执行命令('刷新仓库')
    })
    注册命令(context, '新建仓库', async _ => {
        var 仓库名称 = await vscode.window.showInputBox({
            prompt: '请输入仓库名称, 可以是中文.',
            placeHolder: '请输入仓库名称, 可以是中文.'
        })
        if (仓库名称 == '' || 仓库名称 == null) {
            return
        }

        var 路径 = await vscode.window.showInputBox({
            prompt: '请输入仓库名称, 只能是数字和字母.',
            placeHolder: '请输入仓库名称, 只能是数字和字母.',
            value: await 翻译(仓库名称)
        })
        if (路径 == '' || 路径 == null) {
            return
        }

        提示('在网页上是可以使用中文作为仓库名称的, 但gitee提供的api并不能用中文, 所以这里使用路径名称作为仓库名称. 已经发邮件反馈了, 等待回复.')

        var res = await 创建仓库(用户配置.令牌, 路径)
        提示(JSON.stringify(res))
        执行命令('刷新仓库')
    })
    注册命令(context, '下载仓库', async a => {
        var 地址 = 获得选择仓库的地址(用户仓库信息, a)
        var 路径 = 获得完整本地地址(用户配置.下载位置, a)

        if (existsSync(路径)) {
            异常(`路径 ${路径} 已存在`)
        }

        提示('开始下载到 ' + 路径)

        await mkdirp(路径)
        var res = await new Promise((res, rej) => gitClone(地址, 路径, err => err ? res(err) : res()))
        if (res != null) {
            异常(res.toString())
        }

        提示('已下载到 ' + 路径)
    })
    注册命令(context, '打开在网页', async a => {
        var 地址 = 获得选择仓库的地址(用户仓库信息, a)
        opn(地址)
    })
    注册命令(context, '打开在资源管理器', async a => {
        var 路径 = 获得完整本地地址(用户配置.下载位置, a)
        if (!existsSync(路径)) {
            await 执行命令('下载仓库', a)
        }
        openExplorer(路径)
    })
    注册命令(context, '打开在vscode', async a => {
        var 路径 = 获得完整本地地址(用户配置.下载位置, a)
        if (!existsSync(路径)) {
            await 执行命令('下载仓库', a)
        }
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(路径), true)
    })
    注册命令(context, '复制仓库地址(https)', async a => {
        var 地址 = 获得选择仓库的地址(用户仓库信息, a)
        clipboardy.writeSync(地址)
        提示('已复制到剪切板')
    })

    执行命令('刷新仓库')
    执行命令('刷新通知')

    if (用户配置.通知自动刷新时间 != 0) {
        Y(s => setTimeout(async () => {
            await 执行命令('刷新通知')
            s(s)
        }, 用户配置.通知自动刷新时间 * 60 * 1000))
    }
}
