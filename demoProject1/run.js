var D = require('dmodule.js')('http://localhost:11546/')

D.import('test').then(module=>{
    module.test()
})