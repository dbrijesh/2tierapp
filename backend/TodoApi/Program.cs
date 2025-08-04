using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using TodoApi.Models;
using TodoApi.Services;

var builder = WebApplication.CreateBuilder(args);

// Add core services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configure CORS to allow Angular frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularApp", policy =>
    {
        policy.WithOrigins("http://localhost:4200")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Configure JWT Authentication with support for both Azure AD v1.0 and v2.0 tokens
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer("AzureADv1", options =>
    {
        // Azure AD v1.0 endpoint configuration (sts.windows.net) 
        options.Authority = "https://sts.windows.net/52451440-c2a9-442f-8c20-8562d49f6846/";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromMinutes(5),
            ValidIssuers = new[]
            {
                "https://sts.windows.net/52451440-c2a9-442f-8c20-8562d49f6846/"
            },
            ValidAudiences = new[] 
            { 
                "01d37875-07ee-427e-8be5-594fbe4c5632", // Application Client ID
                "00000003-0000-0000-c000-000000000000"  // Microsoft Graph API
            }
        };
        
        // Event handlers for v1.0 token validation logging
        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                Console.WriteLine($"v1.0 Authentication failed: {context.Exception.Message}");
                return Task.CompletedTask;
            },
            OnTokenValidated = context =>
            {
                Console.WriteLine("v1.0 Token validated successfully");
                var claims = context.Principal?.Claims?.Select(c => $"{c.Type}: {c.Value}");
                Console.WriteLine($"v1.0 Claims: {string.Join(", ", claims ?? new string[0])}");
                return Task.CompletedTask;
            }
        };
    })
    .AddJwtBearer("AzureADv2", options =>
    {
        // v2.0 endpoint configuration (login.microsoftonline.com)
        options.Authority = "https://login.microsoftonline.com/52451440-c2a9-442f-8c20-8562d49f6846/v2.0";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromMinutes(5),
            ValidIssuers = new[]
            {
                "https://login.microsoftonline.com/52451440-c2a9-442f-8c20-8562d49f6846/v2.0"
            },
            ValidAudiences = new[] 
            { 
                "01d37875-07ee-427e-8be5-594fbe4c5632", // Client ID
                "00000003-0000-0000-c000-000000000000"  // Microsoft Graph
            }
        };
        
        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                Console.WriteLine($"v2.0 Authentication failed: {context.Exception.Message}");
                return Task.CompletedTask;
            },
            OnTokenValidated = context =>
            {
                Console.WriteLine("v2.0 Token validated successfully");
                var claims = context.Principal?.Claims?.Select(c => $"{c.Type}: {c.Value}");
                Console.WriteLine($"v2.0 Claims: {string.Join(", ", claims ?? new string[0])}");
                return Task.CompletedTask;
            }
        };
    })
    .AddJwtBearer(options =>
    {
        // Default scheme that tries both v1.0 and v2.0
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromMinutes(5),
            ValidIssuers = new[]
            {
                "https://sts.windows.net/52451440-c2a9-442f-8c20-8562d49f6846/",
                "https://login.microsoftonline.com/52451440-c2a9-442f-8c20-8562d49f6846/v2.0"
            },
            ValidAudiences = new[] 
            { 
                "01d37875-07ee-427e-8be5-594fbe4c5632", // Client ID
                "00000003-0000-0000-c000-000000000000"  // Microsoft Graph
            }
        };
        
        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                Console.WriteLine($"Default Authentication failed: {context.Exception.Message}");
                return Task.CompletedTask;
            },
            OnTokenValidated = context =>
            {
                Console.WriteLine("Default Token validated successfully");
                var issuer = context.Principal?.FindFirst("iss")?.Value;
                var version = issuer?.Contains("sts.windows.net") == true ? "v1.0" : "v2.0";
                Console.WriteLine($"Token version: {version}, Issuer: {issuer}");
                var claims = context.Principal?.Claims?.Select(c => $"{c.Type}: {c.Value}");
                Console.WriteLine($"Claims: {string.Join(", ", claims ?? new string[0])}");
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.DefaultPolicy = new AuthorizationPolicyBuilder()
        .AddAuthenticationSchemes(JwtBearerDefaults.AuthenticationScheme, "AzureADv1", "AzureADv2")
        .RequireAuthenticatedUser()
        .Build();
});

// Add TodoService as Singleton for in-memory storage
builder.Services.AddSingleton<ITodoService, TodoService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAngularApp");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();