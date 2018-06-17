'use strict';

var fs                          = require('fs');
var path                        = require('path');
var mkdirp                      = require('mkdirp')
const uuidv1                    = require('uuid/v1');
var crypto                      = require('crypto');
var sqlite3                     = require('sqlite3');
var os                          = require('os')
var perf                        = require('./perf')
var db_helper                   = require("./db_helper")
var isBinaryFile                = require("isbinaryfile");
var userData
var childProcessName
var nextCallId = 0

var inProcessFilesFn                    = false;
var isWin                               = /^win/.test(process.platform);
var numberOfSecondsIndexFilesInterval   = 5;
var inScan                              = false;
var stmt2                               = null;
var stmt3                               = null;
var setIn                               = null;
var updateProcessTable                  = null;
var lockData                            = null;
var unlockData                          = null;
var stmtInsertIntoCode                  = null;
var stmtUpdateCode                      = null;
var inGetRelatedDocumentHashes          = false;
var inIndexFileRelationshipsFn          = false;
var finishedFindingFolders              = false;
var username                            = "Unknown user";
var dbsearch;
var xdiff;
var lhs;
var rhs;
var stmtInsertIntoRelationships;
var stmtUpdateRelationships2;

var stmtUpdateFolder;
var stmtResetFolders;
var stmtInsertDriver;
var stmtUpdateDriver;
var stmtInsertIntoQueries;

var stmtResetFiles;
var stmtFileChanged;
var stmtInsertIntoMessages;
var stmtInsertIntoFiles;
var stmtInsertIntoFiles2;
var stmtUpdateFileStatus;
var stmtUpdateFileSizeAndShaAndConnectionId;
var stmtUpdateFileProperties;

var stmtInsertIntoContents;
var stmtInsertIntoFolders;
var stmtInsertIntoConnections;
var stmtInsertIntoConnections2;

var stmtInsertIntoIntranetClientConnects;

var stmtInsertInsertIntoQueries;
var stmtUpdateRelatedDocumentCount;
var stmtUpdateRelationships;

var incrJobCount;

var decrJobCount;


var in_when_queries_changes             = false;
var in_when_connections_change          = false;


username = os.userInfo().username.toLowerCase();
//console.log(username);

//dbsearch.run("PRAGMA synchronous=OFF;")
//dbsearch.run("PRAGMA count_changes=OFF;")
//dbsearch.run("PRAGMA journal_mode=MEMORY;")
//dbsearch.run("PRAGMA temp_store=MEMORY;")







processMessagesFromMainProcess();

function processMessagesFromMainProcess() {
    process.on('message', (msg) => {


    if  (msg.message_type == 'init') {

        //console.log('-- Init v3');
        userData            = msg.user_data_path
        childProcessName    = msg.child_process_name

        //console.log("  Child recieved user data path: " + userData)
        var dbPath = path.join(userData, username + '.visi')

        //console.log("  DB path: " + dbPath)
        dbsearch = new sqlite3.Database(dbPath);
        dbsearch.run("PRAGMA journal_mode=WAL;")
        process.send({  message_type:       "database_setup_in_child" ,
                        child_process_name:  childProcessName
                        });


        setUpSql()






        } else if (msg.message_type == 'setUpSql') {


             //console.log(" --- setUpSql --- ")
             setUpSql();
             processDrivers(init);





     } else if (msg.message_type == "function_call_response") {

         console.log("*) Response received at Scheduler ")
         console.log("*) result generated by call ID: " + msg.called_call_id)
         var callDetails = callList[msg.called_call_id]
         //console.log("*) call details: " + JSON.stringify(msg,null,2))

         if (callDetails == null) {
            console.log("In Scheduler:function_call_response   callList    is not set for : " + JSON.stringify(msg,null,2))
            return
         }
         var parentCallId = callDetails.parent_call_id
         //console.log("*) parent call ID: " + JSON.stringify(parentCallId,null,2))

         var processName
         if (parentCallId == -1) {
             processName = "forked"
         } else {
             var parentCallDetails = callList[parentCallId]
             console.log("*) parent call details: " + JSON.stringify(parentCallDetails,null,2))
             //console.log("*) Response: " + JSON.stringify(msg.result,null,2))
             processName = parentCallDetails.process_name
         }

         //console.log("msg.callback_index returned: " + msg.callback_index)
         process.send({     message_type:       "return_response_to_function_caller" ,
                            child_process_name:  processName,
                            callback_index:      msg.callback_index,
                            result:              msg.result
                        });



     } else if (msg.message_type == "processor_free") {

        processesInUse[msg.child_process_name] = false

        dbsearch.serialize(
            function() {
                dbsearch.run("begin exclusive transaction");
                decrJobCount.run(msg.child_process_name)
                dbsearch.run("commit");
            })








     } else if (msg.message_type == "function_call_request") {

             dbsearch.serialize(
                 function() {
                     var stmt = dbsearch.all(
                       "SELECT * FROM system_code where driver = ? and on_condition like '%" + msg.method_name + "%'; ",

                        msg.driver_name,

                         function(err, results)
                         {
                             if (results) {
                                scheduleJobWithCodeId(  results[0].id,
                                                        msg.args,
                                                        msg.caller_call_id,
                                                        msg.callback_index)
                                 //callbackFn(results[0].id);
                             } else {
                                 //callbackFn(null)
                             }

                         })
             }, sqlite3.OPEN_READONLY)
             //
             //child_process_name:    msg.child_process_name,
             //driver_name:           msg.driver_name,
             //method_name:           msg.method_name,
             //args:                  msg.args,
             //callback_index:        msg.callback_index







        } else if (msg.message_type == 'startNode') {


             //console.log(" --- Started Node --- ")
             //console.log("     Node ID: " + msg.node_id)
             //console.log("     Process ID: " + msg.child_process_id)
             //console.log("     Started: " + msg.started)
             processesInUse[msg.node_id] = false
             dbsearch.serialize(
                 function() {
                     dbsearch.run("begin exclusive transaction");
                     updateProcessTable.run(
                         msg.node_id,
                         msg.child_process_id,
                         msg.started,
                         "IDLE",
                         null
                         )
                     dbsearch.run("commit");


                    //process.send({  message_type:       "execute_code_in_exe_child_process" ,
                    //                child_process_name:  msg.node_id,
                    //                old_code:               `console.log("Sent from Scheduler")`
                    //                });


                 })

        }




    });
}





//-----------------------------------------------------------------------------------------//
//                                                                                         //
//                                        setUpSql                                         //
//                                                                                         //
//   This sets up the SqlLite prepared statements                                          //
//                                                                                         //
//                                                                                         //
//                                                                                         //
//                                                                                         //
//                                                                                         //
//                                                                                         //
//-----------------------------------------------------------------------------------------//
function setUpSql() {

    incrJobCount = dbsearch.prepare("UPDATE system_process_info SET status = 'RUNNING', last_driver = ?, last_event = ?, system_code_id = ? WHERE process = ?");

    decrJobCount = dbsearch.prepare("UPDATE system_process_info SET status = 'IDLE' WHERE process = ?");


    updateProcessTable = dbsearch.prepare(
        " insert or replace into "+
        "     system_process_info (process, process_id, running_since, status, job_priority) " +
        " values " +
        "     (?,?,?,?,?)"
    )

    lockData = dbsearch.prepare("UPDATE all_data SET status = 'LOCKED' WHERE id = ?");

    unlockData = dbsearch.prepare("UPDATE all_data SET status = NULL WHERE id = ?");

    stmtInsertIntoCode = dbsearch.prepare(  " insert into system_code " +
                                                "      ( id, on_condition, driver, method, code, max_processes, component_type ) " +
                                                " values " +
                                                "      ( ?,  ?, ? , ?, ?, ?, ?);");

    stmtUpdateCode = dbsearch.prepare(  " update system_code " +
                                                "      set on_condition     = ?, "+
                                                "          code             = ?, " +
                                                "          max_processes    = ? " +
                                                " where  " +
                                                "      id = ?;");
}



function driversFn(callbackFn) {
    dbsearch.serialize(
        function() {
            var stmt = dbsearch.all(
                "SELECT * FROM drivers",

                function(err, results) {
                    callbackFn( results );
                })
    }, sqlite3.OPEN_READONLY)
}






function processDrivers(  callbackFn  ) {
    //console.log("Process drivers")
    //console.log("")
    //console.log("")
    //console.log("")
    //console.log("")

    driversFn(function(listOfDrivers) {
    //console.log("Process drivers: " + JSON.stringify(listOfDrivers,null,2))
        if (listOfDrivers) {
            for (var i=0; i< listOfDrivers.length; i ++) {
                //console.log("Process drivers: " + JSON.stringify(listOfDrivers[i],null,2))
                addEventCode(listOfDrivers[i].name, listOfDrivers[i].code)
            }
            callbackFn()

        }
    })
}


var esprima = require('esprima');
//zzz
function addEventCode(driverName, code) {
    //console.log(code)
    var oncode = "\"app\""
    var eventName = "app"
    var maxProcesses = 1

    var prjs = esprima.parse( "(" + code + ")");
    if (prjs.body) {
        if (prjs.body[0]) {
            if (prjs.body[0].expression) {
                if (prjs.body[0].expression.id) {
                    console.log(driverName + ": " + JSON.stringify(prjs.body[0].expression.id.name,null,2))
                    var oncode = "\"" + prjs.body[0].expression.id.name + "\""
                    var eventName = prjs.body[0].expression.id.name
                }
            }
        }
    }



    //console.log("    startIndex: " + JSON.stringify(startIndex,null,2))
    //console.log("          on: " + JSON.stringify(oncode,null,2))


    var componentType = ""
    if (code.indexOf("is_app()") != -1) {
        componentType = "app"
    }


    //console.log("          code: " + JSON.stringify(code,null,2))



    dbsearch.serialize(
        function() {
            var result = []
            var stmt = dbsearch.all(
                "SELECT * FROM system_code where driver = ? and method = ?",
                [driverName, eventName],

                function(err, results)
                {
                    if (results.length == 0) {
                        var newId   = uuidv1();
                        dbsearch.serialize(
                            function() {
                                dbsearch.run("begin exclusive transaction");
                                stmtInsertIntoCode.run(
                                    newId,
                                    oncode,
                                    driverName,
                                    eventName,
                                    code,
                                    maxProcesses,
                                    componentType)
                                dbsearch.run("commit");
                            })


                    } else {
                        dbsearch.serialize(
                            function() {
                                dbsearch.run("begin exclusive transaction");
                                stmtUpdateCode.run(
                                    oncode,
                                    code,
                                    maxProcesses,
                                    results[0].id
                                )
                                dbsearch.run("commit");
                            })

                    }

                })
    }, sqlite3.OPEN_READONLY)
}


var functions = new Object()








function init() {
    parseEvents()

    setInterval( findNextJobToRun, 1000)
}







function parseEvents() {

    //console.log("function(executeCode) {")
    parseAllEvents()

}




var inScheduleCode2 = false;
function findNextJobToRun() {
    if (inScheduleCode2) {
        return
    }
    inScheduleCode2 = true

    var code_id = null

    for (var ff = 0; ff < eventList.length; ff++) {
        var cond = eventList[ff]
        code_id = cond.id
        if (cond.condType == "query") {
            testQueryToExecute(cond, code_id)

        }
    }
    inScheduleCode2 = false

}



function testQueryToExecute(cond, code_id) {
    if (cond.condition.where) {
        dbsearch.serialize(
            function() {
                var stmt = dbsearch.all(
                    `select
                         count( process ) as cnt_max
                     from
                         system_process_info
                     where
                         system_code_id = ?
                     and
                         status = 'RUNNING'
                    `
                    ,
                    code_id
                    ,
                    function(err, results)
                    {
                        if (err) {
                            console.log("err: " + err)
                        } else {
                            //console.log("")
                            //console.log(JSON.stringify(cond,null,2))
                            //console.log("Process count    :" + JSON.stringify(results[0].cnt_max,null,2))
                            //console.log("Process count max:" + JSON.stringify(cond.max_processes,null,2))
                            //console.log("")
                            if (cond.max_processes && (results[0].cnt_max >= cond.max_processes)) {
                            } else {
                                //console.log("*) Executing SQlite: " + cond.condition.where)
                                dbsearch.serialize(
                                    function() {
                                        var stmt = dbsearch.all(
                                            "SELECT * FROM all_data where " +  cond.condition.where + " and status is NULL LIMIT 1",

                                            function(err, results)
                                            {
                                                if (results) {
                                                    if (results.length > 0) {

                                                        dbsearch.serialize(
                                                            function() {
                                                                dbsearch.run("begin exclusive transaction");
                                                                lockData.run(results[0].id)
                                                                dbsearch.run("commit",
                                                                    function() {

                                                                        //console.log("*) INIT -  starting the first job")
                                                                        scheduleJobWithCodeId(  code_id,  results,  null, null )
                                                                        inScheduleCode2 = false
                                                                    });
                                                                })



                                                    }
                                                } else {
                                                    inScheduleCode2 = false
                                                }
                                            })
                                }, sqlite3.OPEN_READONLY)
                            }
                        }
                    })
        }, sqlite3.OPEN_READONLY)
        //console.log("testQueryToExecute: " + JSON.stringify(cond,null,2))



    }
}







var processesInUse = new Object()

function scheduleJobWithCodeId(codeId, args,  parentCallId, callbackIndex) {

    var processToUse = null
    var processNames = Object.keys(processesInUse)

    for( var processNameIndex = 0 ; processNameIndex < processNames.length; processNameIndex ++) {

        var actualProcessName   = processNames[ processNameIndex ]
        var isInUse             = processesInUse[ actualProcessName ]

        //console.log(" select * from system_process_info    ")
        //console.log("    " + JSON.stringify(results,null,2))

        if ( !isInUse ) {
            processToUse = actualProcessName
            processesInUse[actualProcessName] = true
            //console.log("    " + JSON.stringify(processToUse,null,2))
            sendJobToProcessName(codeId, args, actualProcessName, parentCallId, callbackIndex)
            break
        }
    }
    if (!processToUse) {
        console.log("Could not find a process to use for " + codeId)
    }
}






function sendToProcess(  id  ,  parentCallId  ,  callbackIndex, processName  ,  driver ,  on_condition  ,  args) {

    var newCallId = nextCallId ++

    callList[  newCallId  ] = {     process_name:       processName,
                                    parent_call_id:     parentCallId        }
    dbsearch.serialize(
        function() {
            dbsearch.run("begin exclusive transaction");
            incrJobCount.run( driver, on_condition, id, processName )
            dbsearch.run("commit");


           process.send({  message_type:       "execute_code_in_exe_child_process" ,
                           child_process_name:  processName,
                           code_id:             id,
                           args:                args,
                           call_id:             newCallId,
                           callback_index:      callbackIndex
                           });


        })
}


var callList = new Object
function sendJobToProcessName(id, args, processName, parentCallId, callbackIndex) {

    dbsearch.serialize(
        function() {
            var stmt = dbsearch.all(
                "SELECT driver, on_condition FROM system_code where id = ? LIMIT 1",
                id,

                function(err, results)
                {
                    if (results) {
                        if (results.length > 0) {


                            sendToProcess(  id,
                                            parentCallId,
                                            callbackIndex,
                                            processName,
                                            results[0].driver,
                                            results[0].on_condition,
                                            args)



                        }
                    }
                })
    }, sqlite3.OPEN_READONLY)

    }






function parseAllEvents( ) {

    dbsearch.serialize(
        function() {
            var stmt = dbsearch.all(
                "SELECT id, on_condition, max_processes FROM system_code; ",

                function(err, results)
                {
                    if (results) {
                        for (var tt = 0; tt < results.length; tt ++) {

                            var cond = results[tt].on_condition
                            try {
                                var evaledCond = eval("(" +  cond + ")")
                                saveEvent(evaledCond, results[tt].id, results[tt].max_processes)
                                //console.log("")
                            } catch (err) {
                                console.log("Error in: "+ cond)
                                console.log(err)
                            }

                        }

                    }

                })
    }, sqlite3.OPEN_READONLY)
}



var eventList = []


function saveEvent(cond, id, maxP) {
    var typeCond =  (typeof cond)
    var saveType = null

    if (typeCond == "string") {
        saveType = "method"

    } else if (typeCond == "object") {
        saveType = "query"

    }
    //console.log("*) type: " + saveType)

    eventList.push({condType:       saveType,
                    condition:      cond,
                    max_processes:  maxP,
                    id:             id})

}







process.on('exit', function(err) {
    shutdownExeProcess(err);
  });
process.on('quit', function(err) {
  shutdownExeProcess(err);
});

function shutdownExeProcess(err) {
    console.log("** Scheduler process was killed: " )
    if (err) {
        console.log("    : " + err)
    }


    if (dbsearch) {
        dbsearch.run("PRAGMA wal_checkpoint;")
    }
}
