var app     =     require("express")();
var mysql   =     require("mysql");
var http    =     require('http').Server(app);
var io      =     require("socket.io")(http);
var nodemailer = require('nodemailer');
var mkdirp = require('mkdirp');
var upload = require("express-fileupload");
const imagesToPdf = require("images-to-pdf")
var md5 = require('md5');
var exe = true;
app.use(upload());
app.use('/files',require("express").static(__dirname + '/files'));
app.use('../ais_new',require("express").static(__dirname + '../ais_new'));
app.use('../ais',require("express").static(__dirname + '../ais'));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', 'DELETE, PUT, POST, GET');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if ('OPTIONS' == req.method) {
    res.sendStatus(200);
  }
  else {
    next();
  }
});
var connection    =    mysql.createPool({
  connectionLimit   :   150,
  host              :   'localhost',
  port              :   3306,
  user              :   'root',
  password          :   '',
  database          :   'qoutationdb',
  debug             :   false,
  multipleStatements : true
});
var connection1    =    mysql.createPool({
  connectionLimit   :   150,
  host              :   'localhost',
  port              :   3306,
  user              :   'root',
  password          :   '',
  database          :   'amstracker',
  debug             :   false,
  multipleStatements : true
});
io.sockets.on('connection', function (socket) {
  if(exe){
    console.log('a user has connected client '+socket.id);
    socket.on("neoConnection",(cb)=>{
      console.log("Neo is connected!");
      cb("Hello I'm the server responding");
    })
    socket.on("getRecent",function(cb){
      connection.query('SELECT * FROM client_details ORDER BY ID DESC LIMIT 15',[],function(error,result){
        if (!error) {
          cb(result);
        }
      });
    });
    socket.on("sql",function(sql,cb){
      connection.query(sql,[],function(error,result){
        if (!error) {
          cb(result);
        }
      });
    });
    socket.on("stop",function(cb){
      exe = false;
    });
    socket.on("search-keyRef",function(keyRef,status,cb){
      if(cb!=null || cb!=undefined){
        connection.query('SELECT * FROM client_details WHERE Key_Ref=? OR Reg_No=? ORDER BY ID DESC',[keyRef,keyRef],function(error,result){
          if (!error) {
            cb(result);
          }
        });
      }else{
        connection.query('SELECT * FROM client_details WHERE Key_Ref=? OR Reg_No=? ORDER BY ID DESC LIMIT 1',[keyRef,keyRef],function(error,result){
          if (!error) {
            status(result);
          }
        });
      }
    });
    socket.on("saveClient",function(fname,lname,cellNo,regNo,vehicleMake,branch,cb){
      if (branch=="MAG SELBY") {
        var prefix = "MS";
      }else if (branch=="MAG LONGMEADOW") {
        var prefix = "ML";
      }else if (branch=="MAG THE GLEN CUSTOMS") {
        var prefix = "MGC";
      }else if (branch=="MAG THE GLEN EASTCLIFF") {
        var prefix = "MGL";
      }
      connection.query('SELECT * FROM client_details WHERE Key_Ref LIKE ? ORDER BY id DESC LIMIT 1',['%'+prefix+'%'],function(error,result){
        if (!error) {
          var lastKeyRef = result[0].Key_Ref;
          console.log(lastKeyRef);
          var filter = /^[0-9-+]+$/;
          if(prefix!="MGC"){
            var Key_Ref = parseFloat(lastKeyRef.substring(2, lastKeyRef.length)) + 1;
          }else{
            var Key_Ref = parseFloat(lastKeyRef.substring(3, lastKeyRef.length)) + 1;
          }
          Key_Ref = prefix + Key_Ref;
          connection.query('INSERT INTO client_details SET ?', {Fisrt_Name:fname,Last_Name:lname,Cell_number:cellNo,Reg_No:regNo,Make:vehicleMake,branch:branch,Key_Ref:Key_Ref}, function (err, results, fields) {
            if (!err) {
              cb(Key_Ref)
            }else{
              cb(false);
            }
          });
        }
      });
    });
    socket.on("saveBookingPhoto", function(Key_Ref,photo_type,url,userId,cb){
      if(cb!=null || cb!=undefined){
        cb=cb;
      }else{
        cb=userId;
        userId = '992';
      }
      var date = dateTimeFn(true);
      var time = dateTimeFn(false);

      url = url.split("/").pop();
      getUserKey(userId,(user)=>{
        if(user!=false){
          connection.query('INSERT INTO securityphotos SET ?', {Key_Ref:Key_Ref,photo_type:photo_type,url:url,date:date,time:time,user:user}, function (err, results, fields) {
            if (!err) {
              cb(true)
            }else{
              cb(false);
              console.log(err);
            }
          });
        }else{
          cb(false);
        }
      });
    });
    socket.on("saveOtherPhoto", function(Key_Ref,photo_type,url,category,comment,userId,status,cb){
      if(cb!=null || cb!=undefined){
        cb=cb;
      }else{
        cb=status;
      }
      var date = dateTimeFn(true);
      var time = dateTimeFn(false);

      url = url.split("/").pop();
      if(comment!=null && comment!="" && comment!=undefined){
        comment=comment;
      }else{
        comment = "";
      }
      getUserKey(userId,(user)=>{
        if(user!=false){
          if(category=="WORK IN PROGRESS"){
            connection.query('SELECT * FROM track_photos WHERE Key_Ref=? AND stage=? AND date=? AND category="WORK IN PROGRESS"',[Key_Ref,photo_type,date],function(error,result){
              if (!error) {
                if(result.length<5){
                  connection.query('INSERT INTO track_photos SET ?', {Key_Ref:Key_Ref,picture_comment:comment,picture_name:url,category:category,date:date,time:time,user:user,stage:photo_type}, function (err, results, fields) {
                    if (!err) {
                      cb(true);
                      if(comment!=""){
                        saveNotesFn(Key_Ref,userId,comment,()=>{});
                        if(status==true && cb!=null){
                          prepareSms(user,Key_Ref,comment);
                        }
                      }
                    }else{
                      cb(false);
                      console.log(err);
                    }
                  });
                }else{
                  cb(false);
                }
              }
            });
          }else{
            connection.query('INSERT INTO track_photos SET ?', {Key_Ref:Key_Ref,picture_comment:comment,picture_name:url,category:category,date:date,time:time,user:user,stage:photo_type}, function (err, results, fields) {
              if (!err) {
                cb(true);
                if(comment!=""){
                  saveNotesFn(Key_Ref,userId,comment,()=>{});
                  if(status==true && cb!=null){
                    prepareSms(user,Key_Ref,comment);
                  }
                }
              }else{
                cb(false);
                console.log(err);
              }
            });
          }
        }else{
          cb(false);
        }
      });
    });
    socket.on("saveStock", function(stockDesc,stockAmount,stockNa,stockSupplier,stockCategory,stockBranch,stockUrl,cb){
      stockUrl = stockUrl.split("/").pop();
      connection.query('INSERT INTO stock SET ?', {description:stockDesc,price:stockAmount,alias:stockNa,supplier:stockSupplier,catergory:stockCategory,branch:stockBranch,icon:stockUrl}, function (err, results, fields) {
        if (!err) {
          cb(true);
        }else{
          cb(false);
          console.log(err);
        }
      });
    });
    socket.on("savePaint", function(description,amount,quantity,supplier,size,branch,icon,cb){
      icon = icon.split("/").pop();
      connection.query('INSERT INTO stock_paint SET ?', {description:description,amount:amount,quantity:quantity,supplier:supplier,size:size,branch:branch,icon:icon}, function (err, results, fields) {
        if (!err) {
          cb(true);
          console.log("Its done baba");
        }else{
          cb(false);
        }
      });
    });
    socket.on("saveNotes", function(notes,Key_Ref,userId,cb){
      saveNotesFn(Key_Ref,userId,notes,(res)=>{cb(res)});
    });
    socket.on("getClientDetails", function(Key_Ref,cb){
      connection.query('SELECT * FROM client_details WHERE Key_Ref=?',[Key_Ref],function(error,result){
        if (!error) {
          cb(result);
        }
      });
    });
    socket.on("getServerIp", function(cb){
      connection.query('SELECT * FROM servers',[],function(error,result){
        if (!error) {
          cb(result);
        }
      });
    });
    socket.on("updateClient", function(Reg_No,Make,Model,Chasses_No,towed_by,Key_Ref,userKey,KM,cb){
      connection.query('UPDATE client_details SET ? WHERE ?',[{Reg_No:Reg_No, Make:Make, Model:Model, Chasses_No:Chasses_No, towed_by:towed_by, checklist_by:userKey, KM:KM},{Key_Ref:Key_Ref}],function(error,result){
        if (!error) {
          cb(true);
        }else{
          cb(false)
          console.log(error)
        }
      });
    });
    socket.on("updateClientDoc",(filePath,Key_Ref,cb)=>{
      cb(true)
    });
    socket.on("login", function(branch,password,cb){
      var userId = Math.floor(Math.random()*899999+100099);
      connection1.query('SELECT * FROM user WHERE use_password=? AND comp_code=?',[md5(password),branch],function(error,result){
        if (!error) {
          if (result.length>0) {
            cb(result[0].use_key);
          }else{
            cb(false);
          }
        }
      });
    });
    socket.on("getBookings", function(Key_Ref,cb){
      connection.query('SELECT * FROM securityphotos WHERE Key_Ref=?',[Key_Ref],function(error,result){
        if (!error) {
          cb(result)
        }
      });
    });
    socket.on("getOtherPhotos", function(Key_Ref,category,cb){
      connection.query('SELECT * FROM track_photos WHERE Key_Ref=? AND category=?',[Key_Ref,category],function(error,result){
        if (!error) {
          cb(result)
        }
      });
    });
    socket.on("update-checklist-event", function(Key_Ref,tyre_rf_make_input,tyre_rf_status_input,tyre_lf_make_input,tyre_lf_status_input,tyre_lr_make_input,tyre_lr_status_input,tyre_rr_make_input,tyre_rr_status_input,sparewheel_make_input,sparewheel_type_input,sparewheel_status_input,mag_rf_type_input,mag_rf_status_input,mag_lf_type_input,mag_lf_status_input,mag_rr_type_input,mag_rr_status_input,mag_lr_type_input,mag_lr_status_input,light_rf_status_input,light_rf_none_input,light_lf_status_input,light_lf_none_input,light_rr_status_input,light_rr_none_input,light_lr_status_input,light_lr_none_input,indicator_rf_status_input,indicator_rf_none_input,indicator_lf_status_input,indicator_lf_none_input,indicator_rr_status_input,indicator_rr_none_input,indicator_lr_status_input,indicator_lr_none_input,mirror_rf_status_input,mirror_rf_none_input,mirror_lf_status_input,mirror_lf_none_input,upholstry_rf_status_input,upholstry_rf_stained_input,upholstry_lf_status_input,upholstry_lf_stained_input,upholstry_rr_status_input,upholstry_rr_stained_input,upholstry_lr_status_input,upholstry_lr_stained_input,A1,A2,A3,A4,A5,A6,A7,A8,A9,B1,B2,B3,B4,B5,B6,B7,B8,B9,cb){
      var a1 = "images/1.jpg";
      var a2 = "images/2.jpg";
      var a3 = "images/3.jpg";
      var a4 = "images/4.jpg";

      var b1 = "images/B1.jpg";
      var b2 = "images/B2.jpg";
      var b3 = "images/B3.jpg";
      var b4 = "images/B4.jpg";
      var b5 = "images/B5.jpg";
      var b6 = "images/B6.jpg";
      var b7 = "images/B7.jpg";

      var c1 = "images/C1.jpg";
      var c2 = "images/C2.jpg";
      var c3 = "images/C3.jpg";
      var c4 = "images/C4.jpg";
      //connection.query('DELETE FROM security_checklist WHERE Key_Ref=?', [Key_Ref],function(err,result){});
      connection.query('SELECT * FROM security_checklist WHERE Key_Ref=? LIMIT 1',[Key_Ref],function(error,result){
        if (!error) {
          if(result.length==0){
            connection.query('INSERT INTO security_checklist SET ?', {Key_Ref:Key_Ref,tyer_rf:'R/F', tyer_rf_make:tyre_rf_make_input, tyer_rf_status:tyre_rf_status_input, tyer_lf:'L/F', tyer_lf_make:tyre_lf_make_input, tyer_lf_status:tyre_lf_status_input,tyer_rr:'R/R', tyer_rr_make:tyre_rr_make_input, tyer_rr_status:tyre_rr_status_input, tyer_lr:'L/R', tyer_lr_make:tyre_lr_make_input, tyer_lr_status:tyre_lr_status_input, s_wheel:sparewheel_type_input, s_wheel_make:sparewheel_make_input, s_wheel_status:sparewheel_status_input, mag_lf:'L/F', mag_lf_descr:mag_lf_type_input, mag_lf_scratch:mag_lf_status_input, mag_lr:'L/R',mag_lr_descr:mag_lr_type_input, mag_lr_scratch:mag_lr_status_input, mag_rf:'R/F', mag_rf_descr:mag_rf_type_input, mag_rf_scratch:mag_rf_status_input, mag_rr:'R/R', mag_rr_descr:mag_rr_type_input, mag_rr_scratch:mag_rr_status_input, light_lf:light_lf_none_input, light_lf_status:light_lf_status_input,light_rf:light_rf_none_input, light_rf_status:light_rf_status_input, light_lr:light_lr_none_input,light_lr_status:light_lr_status_input, light_rr:light_rr_none_input, light_rr_status:light_rr_status_input ,indi_lf:indicator_lf_none_input,indi_lf_status:indicator_lf_status_input, indi_rf:indicator_rf_none_input, indi_rf_status:indicator_rf_status_input, indi_lr:indicator_lr_none_input, indi_lr_status:indicator_lr_status_input, indi_rr:indicator_rr_none_input, indi_rr_status:indicator_rf_status_input, mirr_lf:mirror_lf_none_input, mirr_lf_status:mirror_lf_status_input ,mirr_rf:mirror_rf_none_input, mirr_rf_status:mirror_rf_status_input, upho_lf:'L/F',upho_lf_status:upholstry_lf_status_input,upho_lf_stain:upholstry_rf_stained_input,upho_rf:'R/F',upho_rf_status:upholstry_rf_status_input,upho_rf_stain:upholstry_rf_stained_input,upho_lr:'L/R', upho_lr_status:upholstry_lr_status_input, upho_lr_stain:upholstry_rf_stained_input ,upho_rr:'R/R', upho_rr_status:upholstry_rr_status_input, upho_rr_stain:upholstry_rr_stained_input, A1:A1, A2:A2, A3:A3, A4:A4, A5:A5, A6:A6, A7:A7, A8:A8, A9:A9, B1:B1, B2:B2, B3:B3, B4:B4, B5:B5, B6:B6, B7:B7, B8:B8, B9:B9}, function (err, results, fields) {
              if (!err) {
                connection.query('INSERT INTO security_checklist_on_vehicle SET ?', {Key_Ref:Key_Ref, lf_tyer:a1, lf_door:a2, lr_door:a3, lr_tyer:a4, f_bumper:b1, f_bonnet:b2, f_windscreen:b3, roof:b4, r_windscreen:b5,boot:b6, r_bumper:b7,rf_tyer:c1,rf_door:c2, rr_door:c3,rr_tyer:c4}, function (err, results, fields) {
                  if (!err) {
                    cb(true);
                    console.log("Its done security");
                  }else{
                    cb(false);
                    console.log(err);
                  }
                });
              }else{
                cb(false);
                console.log(err);
              }
            });
          }else{
            connection.query('UPDATE security_checklist SET ? WHERE ?',[{tyer_rf:'R/F', tyer_rf_make:tyre_rf_make_input, tyer_rf_status:tyre_rf_status_input, tyer_lf:'L/F', tyer_lf_make:tyre_lf_make_input, tyer_lf_status:tyre_lf_status_input,tyer_rr:'R/R', tyer_rr_make:tyre_rr_make_input, tyer_rr_status:tyre_rr_status_input, tyer_lr:'L/R', tyer_lr_make:tyre_lr_make_input, tyer_lr_status:tyre_lr_status_input, s_wheel:sparewheel_type_input, s_wheel_make:sparewheel_make_input, s_wheel_status:sparewheel_status_input, mag_lf:'L/F', mag_lf_descr:mag_lf_type_input, mag_lf_scratch:mag_lf_status_input, mag_lr:'L/R',mag_lr_descr:mag_lr_type_input, mag_lr_scratch:mag_lr_status_input, mag_rf:'R/F', mag_rf_descr:mag_rf_type_input, mag_rf_scratch:mag_rf_status_input, mag_rr:'R/R', mag_rr_descr:mag_rr_type_input, mag_rr_scratch:mag_rr_status_input, light_lf:light_lf_none_input, light_lf_status:light_lf_status_input,light_rf:light_rf_none_input, light_rf_status:light_rf_status_input, light_lr:light_lr_none_input,light_lr_status:light_lr_status_input, light_rr:light_rr_none_input, light_rr_status:light_rr_status_input ,indi_lf:indicator_lf_none_input,indi_lf_status:indicator_lf_status_input, indi_rf:indicator_rf_none_input, indi_rf_status:indicator_rf_status_input, indi_lr:indicator_lr_none_input, indi_lr_status:indicator_lr_status_input, indi_rr:indicator_rr_none_input, indi_rr_status:indicator_rf_status_input, mirr_lf:mirror_lf_none_input, mirr_lf_status:mirror_lf_status_input ,mirr_rf:mirror_rf_none_input, mirr_rf_status:mirror_rf_status_input, upho_lf:'L/F',upho_lf_status:upholstry_lf_status_input,upho_lf_stain:upholstry_rf_stained_input,upho_rf:'R/F',upho_rf_status:upholstry_rf_status_input,upho_rf_stain:upholstry_rf_stained_input,upho_lr:'L/R', upho_lr_status:upholstry_lr_status_input, upho_lr_stain:upholstry_rf_stained_input ,upho_rr:'R/R', upho_rr_status:upholstry_rr_status_input, upho_rr_stain:upholstry_rr_stained_input, A1:A1, A2:A2, A3:A3, A4:A4, A5:A5, A6:A6, A7:A7, A8:A8, A9:A9, B1:B1, B2:B2, B3:B3, B4:B4, B5:B5, B6:B6, B7:B7, B8:B8, B9:B9},{Key_Ref:Key_Ref}],function(error,result){
              if (!error) {
                connection.query('UPDATE security_checklist_on_vehicle SET ? WHERE ?',[{lf_tyer:a1, lf_door:a2, lr_door:a3, lr_tyer:a4, f_bumper:b1, f_bonnet:b2, f_windscreen:b3, roof:b4, r_windscreen:b5, boot:b6, r_bumper:b7, rf_tyer:c1, rf_door:c2, rr_door:c3, rr_tyer:c4},{Key_Ref:Key_Ref}],function(error,result){
                  if (!error) {
                    cb(true);
                  }else{
                    cb(false)
                    console.log(error)
                  }
                });
              }else{
                cb(false)
                console.log(error)
              }
            });
          }
        }
      });
    });
    socket.on("get-more-checklist",function(keyRef,cb){
      connection.query('SELECT * FROM security_checklist WHERE Key_Ref=? LIMIT 1',[keyRef],function(error,result){
        if (!error) {
          cb(result);
        }
      });
    });
    socket.on("tripAccepted",(driverLat,driverLon,driverId,initiatorId,destinationLat,destinationLon,timeInitiated,cb)=>{
        connection.query('INSERT INTO trips SET ?', {driverLat:driverLat, driverLon:driverLon, driverId:driverId,initiatorId:initiatorId, destinationLat:destinationLat, destinationLon:destinationLon, timeInitiated:timeInitiated}, function (err, results, fields) {
            if (!err) {
                var tripId = results.insertId;
                cb(tripId);
            }else{
                cb(false)
            }
        });
    });
    socket.on("trackDriver",(latitude,longitude,userId,tripId,time)=>{
        connection.query('SELECT * FROM trips WHERE id=? AND status=?', [tripId,'0'],function(error,result){
          if (!error) {
            if (result.length>0) {
                connection.query('INSERT INTO location_logs SET ?', {latitude:latitude,longitude:longitude,userId:userId,tripId:tripId,time:time}, function (err, results, fields) {});
            }
          }
        });
    });
    socket.on("tripComplete",(tripId)=>{
        connection.query('UPDATE trips SET ? WHERE ?', [{ status:'1' }, { id: tripId }],function(err,result){
            if(!err) {
                cb(true);
            }
        });
    });
    socket.on("getProgress",(from,to,userId,cb)=>{
      var resultObj=[];
      getUserKey(userId,(user)=>{
        if(user!=false){
          connection.query('SELECT * FROM securityphotos WHERE user=? AND date BETWEEN ? AND ?', [user,from,to],function(err,results,fields){
            if(!err){
              const cars = [...new Set(results.map(item => item.Key_Ref))].length;
              resultObj.push({category:"BOOKING PHOTOS",cars:cars,photos:results.length})

              connection.query('SELECT * FROM track_photos WHERE category=? AND date BETWEEN ? AND ?', ['ACCIDENT',user,from,to],function(err,results,fields){
                if(!err){
                  const cars = [...new Set(results.map(item => item.Key_Ref))].length;
                  resultObj.push({category:"ACCIDENT PHOTOS",cars:cars,photos:results.length});

                  connection.query('SELECT * FROM track_photos WHERE category=? AND user=? AND date BETWEEN ? AND ?', ['WORK IN PROGRESS',user,from,to],function(err,results,fields){
                    if(!err){
                      const cars = [...new Set(results.map(item => item.Key_Ref))].length;
                      resultObj.push({category:"WORK IN PROGRESS",cars:cars,photos:results.length})

                      connection.query('SELECT * FROM track_photos WHERE category=? AND user=? AND date BETWEEN ? AND ?', ['FINAL STAGE',user,from,to],function(err,results,fields){
                        if(!err){
                          const cars = [...new Set(results.map(item => item.Key_Ref))].length;
                          resultObj.push({category:"FINAL STAGE",cars:cars,photos:results.length})
                          
                          connection.query('SELECT * FROM track_photos WHERE category=? AND user=? AND date BETWEEN ? AND ?', ['ADDITIONAL',user,from,to],function(err,results,fields){
                            if(!err){
                              const cars = [...new Set(results.map(item => item.Key_Ref))].length;
                              resultObj.push({category:"ADDITIONALS",cars:cars,photos:results.length})
                              cb(resultObj)
                            }else{
                              console.log(err)
                              cb(false)
                            }
                          });
                        }else{
                          console.log(err)
                          cb(false)
                        }
                      });
                    }else{
                      console.log(err)
                      cb(false)
                    }
                  });
                }else{
                  console.log(err)
                  cb(false)
                }
              });
            }else{
              console.log(err)
              cb(false)
            }
          });
        }
      });
    });
  }
});
http.listen(3000, function() {
  console.log("Listening on 3000");
  connection.getConnection(function(err,conn){  
    if (!!err) {
      console.log("database Access Denied "+err);
    }else{
      conn.release();
      console.log("database Access granted");
    }
  });
});
const dateTimeFn = (isDate)=>{
  var current = new Date();
  var fullYear = current.getFullYear();
  var month = current.getMonth() + 1;
  var date1 = current.getDate();
  var hours = current.getHours();
  var minutes = current.getMinutes(); 
  if (date1<10) {
    date1= "0"+date1;
  }
  if (month<10) {
    month= "0"+month;
  }
  if (minutes<10) {
    minutes= "0"+minutes;
  }
  if(isDate){
    return fullYear+"-"+month+"-"+date1;
  }else{
    return time = hours+":"+minutes;
  }
}
const prepareSms = (user,Key_Ref,comment)=>{
  connection.query('SELECT * FROM client_details WHERE Key_Ref=?',[Key_Ref],function(error,result){
    if (!error) {
      var phoneNumber = result[0].Cell_number;
      phoneNumber = phoneNumber.replace(/\s/g, '');
      if(phoneNumber.length==10){
        var newPhoneNumber = "+27"+phoneNumber.slice(1,phoneNumber.length)
      }else{
        var newPhoneNumber=phoneNumber;
      }
      var date = dateTimeFn(true);
      var time = dateTimeFn(false);
      sendSms(newPhoneNumber,comment,(res)=>{
        if(res){
          if(JSON.stringify(res).includes("SENT")){
            console.log("Message sent to "+newPhoneNumber);
            connection.query('INSERT INTO sms_eventlog SET ?', {Key_Ref:Key_Ref,id_ref:0,stage_no:1,title:comment,message:comment,status:1,user:user,sent_date:date,sent_time:time}, function (err, results, fields) {
              if (!err) {
                console.log("sms saved success");
              }else{
                console.log(err);
              }
            });
          }
        }else{
          console.log("Could not send the message");
        }
      })
    }
  });
}
const sendSms = (to,body,cb)=>{
  const https = require('https');
  let username = 'maggroup';
  let password = 'J@hn1654';
  let postData = JSON.stringify({
    'to' : [to],
    'body': body,
    'from': 'M.A.G'
  });
  let options = {
    hostname: 'api.bulksms.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': postData.length,
      'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
    }
  };
  let req = https.request(options, (resp) => {
    let data = '';
      resp.on('data', (chunk) => {
      data += chunk;
    });
    resp.on('end', () => {
      //console.log(data);
      cb(data)
    });
  });
  req.on('error', (e) => {
    console.error(e);
    cb(false)
  });
  req.write(postData);
  req.end();
}
const getUserKey = (userId,cb) =>{
  connection1.query('SELECT * FROM user WHERE use_key=?',[userId],function(error,result){
    if (!error) {
      if (result.length>0) {
        cb(result[0].use_username);
      }else{
        cb(false);
      }
    }else{
      cb(false);
    }
  });
}
const saveNotesFn = (Key_Ref,userId,notes,cb)=>{
  var date = dateTimeFn(true);
  var time = dateTimeFn(false);
  getUserKey(userId,(user)=>{
    if(user!=false){
      connection.query('INSERT INTO notes SET ?', {note:notes,Key_Ref:Key_Ref,user:user,date:date,time:time,status:0,identity:''}, function (err, results, fields) {
        if (!err) {
          cb(true);
          console.log("saved");
        }else{
          console.log(err);
        }
      });
    }else{
      cb(user);
    }
  });
}
app.post("/upload",function(req,res){
  console.log("About to upload files...");
  if (req.files) {
    var file=req.files.fileUrl;
    var filePath=req.body.filePath;
    var pathToBeCreated = req.body.filePath.split("/");
    pathToBeCreated.pop();
    console.log(filePath);
    if(req.body.filePath.split("/")[3]=="security_images"){
      var Key_Ref = req.body.filePath.split("/")[4];
      var newDir = "../ais/public/images/mag_security/"+Key_Ref+"/";
    }else if(req.body.filePath.split("/")[2]=="photos"){
      var Key_Ref = req.body.filePath.split("/")[3];
      var newDir = "../ais/public/images/mag_photos/"+Key_Ref+"/";
    }else{
      var newDir = "NONE";
    }

    mkdirp(pathToBeCreated.join('/'), function (err) {
      if (err) console.error(err)
      else console.log('directory avatar was created');
      file.mv(filePath,function(err){
        if (err) {
          console.log(err);
        }else{
          res.send("success");
          if(filePath.includes("scanned_doc")){
            var pdfPath=req.body.pdfPath;
            convertImageToPdf(filePath,pdfPath,Key_Ref);
          }
          if(newDir!="NONE"){
            mkdirp(newDir, function (err) {
            if (err) console.error(err)
              else console.log('directory avatar was created');
              file.mv(filePath,function(err){
                if (err) {
                  console.log(err);
                }
              });
            });
          }
        }
      });
    });
  }
});
const convertImageToPdf = async(filePath,pdfPath,activeKeyRef)=>{
  await imagesToPdf([filePath], pdfPath)
}
//forever start -c nodemon --minUptime 1000 --spinSleepTime 1000 index.js