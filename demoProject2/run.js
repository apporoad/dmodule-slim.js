var D = require('dmodule.js')('http://localhost:11546/')

//采用版本
D.use()

D.load('demo').then(module=>{
    module.test()
})
D.require('test','demo').then((testModule,demoModule)=>{
    testMdoule.test()
    demoModule.test()
})