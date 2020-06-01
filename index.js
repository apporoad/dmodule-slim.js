const utils = require('lisa.utils')
const uType = utils.Type
const calller = require('caller.js')
const fs = require('fs')
const path = require('path')
const request = require('lightning-request')
const LiSASync = require('lisa.sync')
const hent = require('hent')
const unzipper = require('lisa.unzip.js')

//所有缓存， 根据workspace，缓存不同
const cache = {}
const getCache = (workspace)=>{
    if(!cache[workspace]){
        var download = path.join(workspace , 'temp_dmodules')
        if(!fs.existsSync(download)){
            fs.mkdirSync(download)
        }
        download = path.join(download,'cache.json')
        if(fs.existsSync(download)){
            download = JSON.parse(fs.readFileSync(download,'utf8'))
        }else{
            fs.writeFileSync(download,'{}')
            download = {}
        }

        cache[workspace] = {
            localCache : {},
            moduleCache : {}
            //downloadCache: download
        }
    }
    return cache[workspace]
}

const loadLocalModules = (workspace)=>{
    var localCache =getCache().localCache
    //缓存
    if(localCache[workspace])
        return localCache[workspace]
    var dir  = path.join(workspace , 'dmodules')
    if(!fs.existsSync(dir)){
        return []
    }
    //遍历文件夹， 提取  *.js  获取文件夹
    var files = fs.readdirSync(dir)
    var rArr =[]
    files.forEach(f=>{
        var aName = path.join(dir, f)
        var state =  fs.statSync(aName)
        if(state.isFile()){
            if(path.extname(aName) == '.js'){
                //  xxx_1.1.3.js
                //xxxx_111111111232323.js
                var ns = utils.endTrim(f, '.js').split('_')
                rArr.push({
                    name : ns[0],
                    version : ns.length>1 ? ns[1] : null,
                    file : aName
                })
            }
        }else{
            //  文件夹情况
            var packageJson = path.join(aName, 'package.json')
            if(fs.existsSync(packageJson)){
                var packageJson = JSON.parse(fs.readFileSync(packageJson,'utf8'))
                rArr.push(Object.assign({},packageJson , { file : aName}))
            }
        }
    })
    //倒排序
    rArr = utils.ArraySort(rArr , (a,b) => {
         if(a.name == b.name)
            return (a.version || '')  <  (b.version || '') ? 1 : -1
        return a.name < b.name ? 1 : -1
    })
    localCache[workspace] = rArr
    return rArr
}

const getCacheMetas = ()=>{}

const loadScript = async (module,config,options) =>{
    // todo 浏览器判断
    
    //缓存判断
    var moduleName = uType.isString(module) ? module : module.name
    var moduleVersion = uType.isString(module) ?   null : module.version
    var cacheKey =  moduleName  + '||'+ moduleVersion || ''
    var moduleCache = getCache().moduleCache
    //只有当存在version时，才加载缓存
    if(moduleVersion &&  moduleCache[cacheKey]){
        return moduleCache[cacheKey]
    }
    //先判断本地是否有对应模块
    var localModules = loadLocalModules(config.workspace)
    if(localModules && localModules.length>0){
        var index = utils.ArrayIndexOf(localModules,module , (one , two)=>{
            if(uType.isString(one)){
                return one == two.name
            }else{
                if(one.version){
                    return one.name == two.name && one .version == two.version
                }else{
                    return one. name == two.name
                }
            }
        })
        if(index > -1){
            var  m = require(localModules[index].file)
            if(moduleVersion)
                moduleCache[cacheKey] = m
            return m
        }
    }

    //根据module 加载对于的modle， 并做缓存
    return await loadRemoteModule(moduleName,version,config)
}
var loadRemoteModule = async (moduleName, version,config)=>{
    var workspace = path.join(config.workspace, 'temp_dmodules')
    //远程拉并加载
    var globalModules =await exports.getGlobalModules()
    if(!globalModules[moduleName] || globalModules[moduleName].length == 0){
        console.log('dmodule : cannot find  module :' + moduleName)
        throw Error('dmodule : cannot find  module :' + moduleName)
    }
    var modules = globalModules[moduleName]
    var rightModule = null
    if(!version){
        rightModule = modules[0]
    }else{
        for(var i =0 ;i<modules.length;i++){
            if(modules[i].version == version){
                rightModule = modules[i]
                break
            }
        }
        if(!rightModule){
            console.log('dmodule : cannot find  module and version :'   + moduleName + '  ' + version)
            throw Error('dmodule : cannot find  module and version :'   + moduleName + '  ' + version)
        }
    }


    var moduleCache = getCache().moduleCache
    var mCacheKey = rightModule.name +  '||' + rightModule.version
    //只有当存在version时，才加载缓存
    if(moduleCache[mCacheKey]){
        return moduleCache[mCacheKey]
    }

    //当本地内存没有缓存时，加载远端
    var downloadCahceKey = rightModule.name + rightModule.version
    var sync = LiSASync(path.join(workspace, 'cache.json'))
    var needDownLoad = false
    var newCache = null
    if(utils.endWith(rightModule.file , '.js')){
         newCache = Object.assign( {},rightModule, {  cache :  path.join(workspace, rightModule.file )})
    }
    else{
        newCache = Object.assign( {},rightModule, {  cache :  path.join(workspace, utils.endTrim(rightModule.file , '.zip') )})
    }
    sync.sync(cache =>{
        if(cache[downloadCahceKey]){
            temp =  cache[downloadCahceKey]
            //判断服务端文件变化，如果变化更新本地文件
            if(cache[downloadCahceKey].sha256 == rightModule.sha256 ){
                //判断文件是否存在
                if(!fs.existsSync(temp.cache)){
                    needDownLoad = true
                    cache[downloadCahceKey] = newCache
                }
            }else{
                //不一致情况
                //删除之前的文件
                if(fs.statSync(temp.cache).isDirectory()){
                    utils.rmrf(temp.cache)
                }
                else
                    fs.unlinkSync(temp.cache)
                needDownLoad = true
                cache[downloadCahceKey] = newCache
            }
        }else{
            // 没有缓存，那么下载处理
            needDownLoad = true
            cache[downloadCahceKey] = newCache
        }
        newCache = cahce[downloadCahceKey]
    })
    //下载处理
    if(needDownLoad){
         var { buffer} = await hent( utils.endTrim(config.url , '/') + '/' + rightModule.file )
         var df =path.join(workspace, rightModule.file )
        fs.writeFileSync(df, buffer)
        if(utils.endWith(df,'.zip')){
            await unzipper.unzip(df,newCache.cache)
            fs.unlinkSync(df)
        }
    }
    // 缓存
    moduleCache[mCacheKey] = require(newCache.cache)
    return moduleCache[mCacheKey] 
} 


var isWorkspace = dir=>{
    var dmouldeJSON = path.join(dir,"dmodule.json")
    if(fs.existsSync(dmouldeJSON)){
        return true
    }
    return false
}
//recurse find a dir with dmodule.json 
var getConfigDir = dir=>{
    var currentDir = dir
    while(true){
        if(isWorkspace(currentDir)){
            return currentDir
        }
        if(currentDir == path.dirname(currentDir)){
            return null
        }
        currentDir = path.dirname(currentDir)
    }
}


const getLocalConfig = (invokerDir) =>{
    var workspace = getConfigDir(invokerDir)
    if(!workspace){
        throw Error('dmoudle error :  can not find dmodule.json  for your invoker: ' + invokerDir )
    }
    var config = JSON.parse(fs.readFileSync(path.join(workspace , 'dmodule.json'), 'utf8'))
    config.workspace = workspace
    return config
}


function DModule(){
    var _this = this
    var _config = null
    this.config = (conf)=>{
        if(conf){
            _config =  uType.isString(conf) ?  { url : conf} :  conf
        }
        return _config
    }
    this.import = this.require = this.load = async (module,options)=>{
        options = options || {}
        //如果为初始化config ， 寻找
        if(!_config){
            _config =  getLocalConfig(calller.getDir())
        }
        //工作目录设立在 dmodule.json 所在路径 或者 调用者
        _config.workspace = _config.workspace || calller.getDir()
        
        return loadScript(module,_config, options)
    }
}


module.exports = function(config){
    var dm = new DModule()
    dm.config(config)
    return dm
}

exports.getLocalModules = loadLocalModules

exports.getGlobalModules =  async(url) =>{
    return await request({ url :  url})
}