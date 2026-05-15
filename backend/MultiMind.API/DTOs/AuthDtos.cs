namespace MultiMind.API.DTOs;

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);
public record AuthResponse(string Token, string Email, Guid UserId);
public record ForgotPasswordRequest(string Email);
public record ResetPasswordRequest(string Email, string Token, string NewPassword);
public record UpdateProfileRequest(string DisplayName);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
