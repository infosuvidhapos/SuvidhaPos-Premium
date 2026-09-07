using Microsoft.Data.SqlClient;
using System.Data;

namespace SuvidhaPOS.Premium.Data;
public sealed class Db
{
    private readonly string _cs;
    public Db(IConfiguration c)=>_cs=c.GetConnectionString("DefaultConnection")!;
    public SqlConnection CreateConnection()=>new(_cs);
    public async Task<object?> ScalarAsync(string sql, params SqlParameter[] p){using var c=CreateConnection();await c.OpenAsync();using var cmd=new SqlCommand(sql,c);cmd.Parameters.AddRange(p);return await cmd.ExecuteScalarAsync();}
    public async Task<List<Dictionary<string,object?>>> QueryAsync(string sql, params SqlParameter[] p){using var c=CreateConnection();await c.OpenAsync();using var cmd=new SqlCommand(sql,c);cmd.Parameters.AddRange(p);using var r=await cmd.ExecuteReaderAsync();var list=new List<Dictionary<string,object?>>();while(await r.ReadAsync()){var d=new Dictionary<string,object?>();for(int i=0;i<r.FieldCount;i++)d[r.GetName(i)]=r.IsDBNull(i)?null:r.GetValue(i);list.Add(d);}return list;}
    public async Task<Dictionary<string,object?>> QuerySingleAsync(string sql, params SqlParameter[] p){var x=await QueryAsync(sql,p);return x.FirstOrDefault()??new();}
}
