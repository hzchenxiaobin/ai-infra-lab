import SwiftUI

// ---------------------------------------------------------------------------
// 登录 / 注册（邮箱 + 密码；注册需 6 位验证码，60s 倒计时防重发）
// ---------------------------------------------------------------------------

struct LoginScreen: View {
    @Environment(SessionStore.self) private var session
    @State private var email = ""
    @State private var password = ""
    @State private var submitting = false
    @State private var errorMessage: String?
    @State private var showRegister = false

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty
            && !password.isEmpty && !submitting
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer(minLength: 60)
                VStack(spacing: 10) {
                    Image(systemName: "circle.hexagongrid.fill")
                        .font(.system(size: 52))
                        .foregroundStyle(Color.accent600)
                    Text("AIInfra Lab")
                        .font(.title.weight(.bold))
                    Text("LEARN · PRACTICE · INTERVIEW")
                        .font(.caption2.weight(.medium))
                        .tracking(4)
                        .foregroundStyle(Color.muted)
                }
                .padding(.bottom, 40)

                VStack(spacing: 14) {
                    AuthTextField(text: $email, placeholder: "邮箱", keyboard: .emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    AuthSecureField(text: $password, placeholder: "密码")

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(Color.accent400)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        submit()
                    } label: {
                        Group {
                            if submitting {
                                ProgressView().tint(Color.ink)
                            } else {
                                Text("登录").fontWeight(.semibold)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.accent600)
                    .disabled(!canSubmit)
                }
                .padding(.horizontal, 28)

                Spacer()

                NavigationLink {
                    RegisterScreen()
                } label: {
                    Text("没有账号？注册一个")
                        .font(.footnote)
                        .foregroundStyle(Color.muted)
                }
                .padding(.bottom, 32)
            }
            .background(Color.page)
            .navigationBarHidden(true)
        }
    }

    private func submit() {
        errorMessage = nil
        submitting = true
        Task {
            defer { submitting = false }
            do {
                try await session.login(
                    email: email.trimmingCharacters(in: .whitespaces).lowercased(),
                    password: password
                )
            } catch let error as TRPCError {
                errorMessage = error.message
                Haptics.warning()
            } catch {
                errorMessage = "网络异常，请稍后重试"
            }
        }
    }
}

struct RegisterScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var code = ""
    @State private var password = ""
    @State private var name = ""

    @State private var sending = false
    @State private var countdown = 0
    @State private var submitting = false
    @State private var errorMessage: String?
    @State private var infoMessage: String?

    private var canSubmit: Bool {
        email.contains("@") && code.count == 6 && password.count >= 8 && !submitting
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                AuthTextField(text: $email, placeholder: "邮箱", keyboard: .emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                HStack(spacing: 10) {
                    AuthTextField(text: $code, placeholder: "验证码（6 位数字）", keyboard: .numberPad)
                    Button {
                        sendCode()
                    } label: {
                        Group {
                            if sending {
                                ProgressView().tint(Color.accent300)
                            } else if countdown > 0 {
                                Text("\(countdown)s")
                            } else {
                                Text("获取验证码")
                            }
                        }
                        .font(.footnote)
                        .frame(width: 96, height: 44)
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.accent600)
                    .disabled(sending || countdown > 0 || !email.contains("@"))
                }

                AuthSecureField(text: $password, placeholder: "密码（至少 8 位）")
                AuthTextField(text: $name, placeholder: "昵称（可选，默认邮箱前缀）")

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(Color.accent400)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if let infoMessage {
                    Text(infoMessage)
                        .font(.footnote)
                        .foregroundStyle(Color(hex: 0x3fb950))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    submit()
                } label: {
                    Group {
                        if submitting {
                            ProgressView().tint(Color.ink)
                        } else {
                            Text("注册并登录").fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.accent600)
                .disabled(!canSubmit)
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
        }
        .background(Color.page)
        .navigationTitle("注册")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("返回登录") { dismiss() }
                    .font(.footnote)
            }
        }
    }

    private func sendCode() {
        errorMessage = nil
        infoMessage = nil
        sending = true
        let target = email.trimmingCharacters(in: .whitespaces).lowercased()
        Task {
            defer { sending = false }
            do {
                try await Services.shared.api.sendCode(email: target)
                infoMessage = "验证码已发送，请查收邮箱（10 分钟内有效）"
                countdown = 60
                Task {
                    while countdown > 0 {
                        try? await Task.sleep(for: .seconds(1))
                        countdown -= 1
                    }
                }
            } catch let error as TRPCError {
                errorMessage = error.message
            } catch {
                errorMessage = "网络异常，请稍后重试"
            }
        }
    }

    private func submit() {
        errorMessage = nil
        submitting = true
        Task {
            defer { submitting = false }
            do {
                try await session.register(
                    email: email.trimmingCharacters(in: .whitespaces).lowercased(),
                    password: password,
                    code: code,
                    name: name.trimmingCharacters(in: .whitespaces).isEmpty ? nil : name
                )
            } catch let error as TRPCError {
                errorMessage = error.message
                Haptics.warning()
            } catch {
                errorMessage = "网络异常，请稍后重试"
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 表单控件
// ---------------------------------------------------------------------------

struct AuthTextField: View {
    @Binding var text: String
    let placeholder: String
    var keyboard: UIKeyboardType = .default
    @FocusState private var focused: Bool

    var body: some View {
        TextField(placeholder, text: $text)
            .keyboardType(keyboard)
            .focused($focused)
            .font(.subheadline)
            .padding(.horizontal, 14)
            .frame(height: 44)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(focused ? Color.accent600 : Color.line))
            .onSubmit { focused = false }
    }
}

struct AuthSecureField: View {
    @Binding var text: String
    let placeholder: String
    @FocusState private var focused: Bool

    var body: some View {
        SecureField(placeholder, text: $text)
            .focused($focused)
            .font(.subheadline)
            .padding(.horizontal, 14)
            .frame(height: 44)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(focused ? Color.accent600 : Color.line))
    }
}
