using MultiMind.API.Models;

namespace MultiMind.API.Repositories;

public interface IUserRepository : IRepository<User>
{
    Task<User?> FindByEmailAsync(string email);
    Task<(IEnumerable<User> Users, int Total)> SearchAsync(string? query, int page, int pageSize);
    Task<int> CountAsync();
}
