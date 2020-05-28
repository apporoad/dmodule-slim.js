const utils = require('lisa.utils')
const uType = utils.Type
const calller = require('caller.js')
const fs = require('fs')
const path = require('path')


const getCacheMetas = ()=>{}

const loadScript = (module,config,options) =>{
    // todo 浏览器判断
    
    //获取metas

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