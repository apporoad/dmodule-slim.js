var D = require('../')('http://localhost:11546/')

D.import('test').then(module=>{
    module.test()
})
D.import('test').then(module=>{
    module.test()
})