#include "nan.h"
using namespace v8;

#include "runas.h"

namespace {

inline
bool GetProperty(Local<Object> obj, const char* key, Local<Value>* value) {
  return Nan::Get(obj, Nan::New<String>(key).ToLocalChecked()).ToLocal(value);
}

void Runas(const Nan::FunctionCallbackInfo<Value>& info) {
  Isolate* isolate = info.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();

  if (!info[0]->IsString() || !info[1]->IsArray() || !info[2]->IsObject()) {
    Nan::ThrowTypeError("Bad argument");
    return;
  }

  String::Utf8Value command_str(isolate, info[0]);
  std::string command(*command_str);
  std::vector<std::string> c_args;

  Local<Array> v_args = Local<Array>::Cast(info[1]);
  uint32_t length = v_args->Length();

  c_args.reserve(length);
  for (uint32_t i = 0; i < length; ++i) {
    String::Utf8Value arg(isolate, v_args->Get(context, i).ToLocalChecked());
    c_args.push_back(std::string(*arg));
  }

  Local<Value> v_value;
  Local<Object> v_options = info[2]->ToObject(context).ToLocalChecked();
  int options = runas::OPTION_NONE;
  if (GetProperty(v_options, "hide", &v_value) && v_value->BooleanValue(isolate))
    options |= runas::OPTION_HIDE;
  if (GetProperty(v_options, "admin", &v_value) && v_value->BooleanValue(isolate))
    options |= runas::OPTION_ADMIN;

  std::string std_input;
  if (GetProperty(v_options, "stdin", &v_value) && v_value->IsString()) {
    String::Utf8Value stdin_str(isolate, v_value);
    std_input = *stdin_str;
  }

  std::string std_output, std_error;
  bool catch_output = GetProperty(v_options, "catchOutput", &v_value) &&
                      v_value->BooleanValue(isolate);
  if (catch_output)
    options |= runas::OPTION_CATCH_OUTPUT;

  int code = -1;
  runas::Runas(command, c_args, std_input, &std_output, &std_error, options,
               &code);

  if (catch_output) {
    Local<Object> result = Nan::New<Object>();
    Nan::Set(result,
             Nan::New<String>("exitCode").ToLocalChecked(),
             Nan::New<Integer>(code));
    Nan::Set(result,
             Nan::New<String>("stdout").ToLocalChecked(),
             Nan::New<String>(std_output).ToLocalChecked());
    Nan::Set(result,
             Nan::New<String>("stderr").ToLocalChecked(),
             Nan::New<String>(std_error).ToLocalChecked());
    info.GetReturnValue().Set(result);
  } else {
    info.GetReturnValue().Set(Nan::New<Integer>(code));
  }
}

void Init(Local<Object> exports) {
  Nan::SetMethod(exports, "runas", Runas);
}

}  // namespace

NODE_MODULE(runas, Init)
