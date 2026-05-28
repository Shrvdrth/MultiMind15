using Microsoft.EntityFrameworkCore;
using MultiMind.API.Data;
using MultiMind.API.Models;

namespace MultiMind.API.Repositories;

public class UserRepository : IUserRepository
{
    private readonly AppDbContext _db;
    public UserRepository(AppDbContext db) => _db = db;

    public async Task<User?> GetByIdAsync(Guid id) =>
        await _db.Users.FindAsync(id);

    public async Task<IEnumerable<User>> GetAllAsync() =>
        await _db.Users.ToListAsync();

    public async Task<User?> FindByEmailAsync(string email) =>
        await _db.Users.FirstOrDefaultAsync(u => u.Email == email.ToLower());

    public async Task<int> CountAsync() =>
        await _db.Users.CountAsync();

    public async Task<(IEnumerable<User> Users, int Total)> SearchAsync(string? query, int page, int pageSize)
    {
        var q = _db.Users.AsQueryable();
        if (!string.IsNullOrWhiteSpace(query))
        {
            var lower = query.ToLower();
            q = q.Where(u => u.Email.Contains(lower) || u.DisplayName.ToLower().Contains(lower));
        }
        var total = await q.CountAsync();
        var users = await q.OrderBy(u => u.CreatedAt)
                           .Skip((page - 1) * pageSize)
                           .Take(pageSize)
                           .ToListAsync();
        return (users, total);
    }

    public async Task AddAsync(User entity)
    {
        await _db.Users.AddAsync(entity);
    }

    public Task UpdateAsync(User entity)
    {
        _db.Users.Update(entity);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(User entity)
    {
        _db.Users.Remove(entity);
        return Task.CompletedTask;
    }

    public async Task SaveChangesAsync() => await _db.SaveChangesAsync();
}
