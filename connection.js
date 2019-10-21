var pool    =    mysql.createPool({
  connectionLimit   :   100,
  host              :   'databasetest.cdeosiunsuwv.us-east-2.rds.amazonaws.com',
  port              :   3306,
  user              :   'admin',
  password          :   'crustcore1',
  database          :   'fps',
  debug             :   false,
  multipleStatements : true
});
