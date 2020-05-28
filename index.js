const utils = require('lisa.utils')
const uType = utils.Type
const calller = require('caller.js')
const fs = require('fs')
const path = require('path')
const request = require('lightning-request')

const localCache = {}
const moduleCache = {}

const loadLocalModules = (workspace)=>{
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
    var cacheKey = uType.isString(module)  ? module : module.name + (module.version || '')
    if(moduleCache[cacheKey]){
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
            moduleCache[cacheKey] = require(localModules[index].file)
            return moduleCache[cacheKey]
        }
    }
    //远程拉并加载
    var globalModules =await exports.getGlobalModules()
    

    //根据module 加载对于的modle， 并做缓存

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