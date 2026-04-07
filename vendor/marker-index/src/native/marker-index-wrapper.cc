#include <unordered_map>
#include "nan.h"
#include "marker-index.h"
#include "range.h"
#include "splice-result.h"

#include <iostream>

using namespace v8;
using std::unordered_set;
using std::unordered_map;

class MarkerIndexWrapper : public Nan::ObjectWrap {
public:
  static void Init(Local<Object> exports, Local<Object> module) {
    Isolate* isolate = exports->GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();

    Local<FunctionTemplate> constructorTemplate =
        Nan::New<FunctionTemplate>(New);
    constructorTemplate->SetClassName(
        Nan::New<String>("MarkerIndex").ToLocalChecked());
    constructorTemplate->InstanceTemplate()->SetInternalFieldCount(1);

    Nan::SetPrototypeMethod(constructorTemplate, "generateRandomNumber", GenerateRandomNumber);
    Nan::SetPrototypeMethod(constructorTemplate, "insert", Insert);
    Nan::SetPrototypeMethod(constructorTemplate, "setExclusive", SetExclusive);
    Nan::SetPrototypeMethod(constructorTemplate, "delete", Delete);
    Nan::SetPrototypeMethod(constructorTemplate, "splice", Splice);
    Nan::SetPrototypeMethod(constructorTemplate, "getStart", GetStart);
    Nan::SetPrototypeMethod(constructorTemplate, "getEnd", GetEnd);
    Nan::SetPrototypeMethod(constructorTemplate, "compare", Compare);
    Nan::SetPrototypeMethod(constructorTemplate, "findIntersecting", FindIntersecting);
    Nan::SetPrototypeMethod(constructorTemplate, "findContaining", FindContaining);
    Nan::SetPrototypeMethod(constructorTemplate, "findContainedIn", FindContainedIn);
    Nan::SetPrototypeMethod(constructorTemplate, "findStartingIn", FindStartingIn);
    Nan::SetPrototypeMethod(constructorTemplate, "findEndingIn", FindEndingIn);
    Nan::SetPrototypeMethod(constructorTemplate, "dump", Dump);

    Local<String> number_string = Nan::New("Number").ToLocalChecked();
    Local<String> is_finite_string = Nan::New("isFinite").ToLocalChecked();
    Local<Object> number_constructor_local = Nan::To<Object>(
        context->Global()->Get(context, number_string).ToLocalChecked()
    ).ToLocalChecked();
    is_finite_function.Reset(Nan::Persistent<Object>(
        Nan::To<Object>(number_constructor_local->Get(context, is_finite_string).ToLocalChecked()).ToLocalChecked()
    ));

    Local<String> set_string = Nan::New("Set").ToLocalChecked();
    Local<String> add_string = Nan::New("add").ToLocalChecked();
    Local<String> prototype_string = Nan::New("prototype").ToLocalChecked();
    Local<Object> set_constructor_local = Nan::To<Object>(
        context->Global()->Get(context, set_string).ToLocalChecked()
    ).ToLocalChecked();
    Local<Object> set_prototype_local = Nan::To<Object>(
        set_constructor_local->Get(context, prototype_string).ToLocalChecked()
    ).ToLocalChecked();
    Local<Object> set_add_method_local = Nan::To<Object>(
        set_prototype_local->Get(context, add_string).ToLocalChecked()
    ).ToLocalChecked();
    set_constructor.Reset(Nan::Persistent<Object>(set_constructor_local));
    set_add_method.Reset(Nan::Persistent<Object>(set_add_method_local));

    row_string.Reset(Nan::Persistent<String>(Nan::New("row").ToLocalChecked()));
    column_string.Reset(Nan::Persistent<String>(Nan::New("column").ToLocalChecked()));
    start_string.Reset(Nan::Persistent<String>(Nan::New("start").ToLocalChecked()));
    end_string.Reset(Nan::Persistent<String>(Nan::New("end").ToLocalChecked()));
    touch_string.Reset(Nan::Persistent<String>(Nan::New("touch").ToLocalChecked()));
    inside_string.Reset(Nan::Persistent<String>(Nan::New("inside").ToLocalChecked()));
    overlap_string.Reset(Nan::Persistent<String>(Nan::New("overlap").ToLocalChecked()));
    surround_string.Reset(Nan::Persistent<String>(Nan::New("surround").ToLocalChecked()));

    module->Set(context,
                Nan::New("exports").ToLocalChecked(),
                constructorTemplate->GetFunction(context).ToLocalChecked()).Check();
  }

private:
  static Nan::Persistent<Object> is_finite_function;
  static Nan::Persistent<Object> set_constructor;
  static Nan::Persistent<Object> set_add_method;
  static Nan::Persistent<String> row_string;
  static Nan::Persistent<String> column_string;
  static Nan::Persistent<String> start_string;
  static Nan::Persistent<String> end_string;
  static Nan::Persistent<String> touch_string;
  static Nan::Persistent<String> inside_string;
  static Nan::Persistent<String> overlap_string;
  static Nan::Persistent<String> surround_string;

  static void New(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *marker_index = new MarkerIndexWrapper(Local<Number>::Cast(info[0]));
    marker_index->Wrap(info.This());
  }

  static void GenerateRandomNumber(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());
    int random = wrapper->marker_index.GenerateRandomNumber();
    info.GetReturnValue().Set(Nan::New<v8::Number>(random));
  }

  static Nan::Maybe<Point> PointFromJS(Nan::MaybeLocal<Object> maybe_object) {
    Isolate* isolate = Isolate::GetCurrent();
    Local<Context> context = isolate->GetCurrentContext();

    Local<Object> object;
    if (!maybe_object.ToLocal(&object)) {
      Nan::ThrowTypeError("Expected an object with 'row' and 'column' properties.");
      return Nan::Nothing<Point>();
    }

    Nan::MaybeLocal<Integer> maybe_row = Nan::To<Integer>(
        object->Get(context, Nan::New(row_string)).ToLocalChecked()
    );
    Local<Integer> js_row;
    if (!maybe_row.ToLocal(&js_row)) {
      Nan::ThrowTypeError("Expected an object with 'row' and 'column' properties.");
      return Nan::Nothing<Point>();
    }

    Nan::MaybeLocal<Integer> maybe_column = Nan::To<Integer>(
        object->Get(context, Nan::New(column_string)).ToLocalChecked()
    );
    Local<Integer> js_column;
    if (!maybe_column.ToLocal(&js_column)) {
      Nan::ThrowTypeError("Expected an object with 'row' and 'column' properties.");
      return Nan::Nothing<Point>();
    }

    unsigned row, column;
    if (IsFinite(js_row)) {
      row = static_cast<unsigned>(js_row->Int32Value(context).FromJust());
    } else {
      row = UINT_MAX;
    }

    if (IsFinite(js_column)) {
      column = static_cast<unsigned>(js_column->Int32Value(context).FromJust());
    } else {
      column = UINT_MAX;
    }

    return Nan::Just(Point(row, column));
  }

  static bool IsFinite(Local<Integer> number) {
    Local<Context> context = Isolate::GetCurrent()->GetCurrentContext();
    Local<Value> argv[] = {number};
    Local<Value> result = Nan::New(is_finite_function)->CallAsFunction(
        context, Nan::Null(), 1, argv
    ).ToLocalChecked();
    return result->BooleanValue(Isolate::GetCurrent());
  }

  static Local<Object> PointToJS(const Point &point) {
    Local<Context> context = Isolate::GetCurrent()->GetCurrentContext();
    Local<Object> result = Nan::New<Object>();
    result->Set(context, Nan::New(row_string), Nan::New<Integer>(point.row)).Check();
    result->Set(context, Nan::New(column_string), Nan::New<Integer>(point.column)).Check();
    return result;
  }

  static Local<Set> MarkerIdsToJS(const unordered_set<MarkerId> &marker_ids) {
    Isolate *isolate = v8::Isolate::GetCurrent();
    Local<Context> context = isolate->GetCurrentContext();
    Local<v8::Set> js_set = v8::Set::New(isolate);

    for (MarkerId id : marker_ids) {
      js_set = js_set->Add(context, Nan::New<Integer>(id)).ToLocalChecked();
    }

    return js_set;
  }

  static Local<Object> SnapshotToJS(const unordered_map<MarkerId, Range> &snapshot) {
    Local<Context> context = Isolate::GetCurrent()->GetCurrentContext();
    Local<Object> result_object = Nan::New<Object>();
    for (auto &pair : snapshot) {
      Local<Object> range = Nan::New<Object>();
      range->Set(context, Nan::New(start_string), PointToJS(pair.second.start)).Check();
      range->Set(context, Nan::New(end_string), PointToJS(pair.second.end)).Check();
      result_object->Set(context, Nan::New<Integer>(pair.first), range).Check();
    }
    return result_object;
  }

  static Nan::Maybe<MarkerId> MarkerIdFromJS(Nan::MaybeLocal<Integer> maybe_id) {
    Local<Integer> id;
    if (!maybe_id.ToLocal(&id)) {
      Nan::ThrowTypeError("Expected an integer marker id.");
      return Nan::Nothing<MarkerId>();
    }

    Local<Context> context = Isolate::GetCurrent()->GetCurrentContext();
    return Nan::Just<MarkerId>(static_cast<MarkerId>(id->Uint32Value(context).FromJust()));
  }

  static Nan::Maybe<bool> BoolFromJS(Nan::MaybeLocal<Boolean> maybe_boolean) {
    Local<Boolean> boolean;
    if (!maybe_boolean.ToLocal(&boolean)) {
      Nan::ThrowTypeError("Expected an boolean.");
      return Nan::Nothing<bool>();
    }

    return Nan::Just<bool>(boolean->Value());
  }

  static void Insert(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());

    Nan::Maybe<MarkerId> id = MarkerIdFromJS(Nan::To<Integer>(info[0]));
    Nan::Maybe<Point> start = PointFromJS(Nan::To<Object>(info[1]));
    Nan::Maybe<Point> end = PointFromJS(Nan::To<Object>(info[2]));

    if (id.IsJust() && start.IsJust() && end.IsJust()) {
      wrapper->marker_index.Insert(id.FromJust(), start.FromJust(), end.FromJust());
    }
  }

  static void SetExclusive(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());

    Nan::Maybe<MarkerId> id = MarkerIdFromJS(Nan::To<Integer>(info[0]));
    Nan::Maybe<bool> exclusive = BoolFromJS(Nan::To<Boolean>(info[1]));

    if (id.IsJust() && exclusive.IsJust()) {
      wrapper->marker_index.SetExclusive(id.FromJust(), exclusive.FromJust());
    }
  }

  static void Delete(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());

    Nan::Maybe<MarkerId> id = MarkerIdFromJS(Nan::To<Integer>(info[0]));
    if (id.IsJust()) {
      wrapper->marker_index.Delete(id.FromJust());
    }
  }

  static void Splice(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());
    Local<Context> context = info.GetIsolate()->GetCurrentContext();

    Nan::Maybe<Point> start = PointFromJS(Nan::To<Object>(info[0]));
    Nan::Maybe<Point> old_extent = PointFromJS(Nan::To<Object>(info[1]));
    Nan::Maybe<Point> new_extent = PointFromJS(Nan::To<Object>(info[2]));
    if (start.IsJust() && old_extent.IsJust() && new_extent.IsJust()) {
      SpliceResult result = wrapper->marker_index.Splice(start.FromJust(), old_extent.FromJust(), new_extent.FromJust());

      Local<Object> invalidated = Nan::New<Object>();
      invalidated->Set(context, Nan::New(touch_string), MarkerIdsToJS(result.touch)).Check();
      invalidated->Set(context, Nan::New(inside_string), MarkerIdsToJS(result.inside)).Check();
      invalidated->Set(context, Nan::New(overlap_string), MarkerIdsToJS(result.overlap)).Check();
      invalidated->Set(context, Nan::New(surround_string), MarkerIdsToJS(result.surround)).Check();
      info.GetReturnValue().Set(invalidated);
    }
  }

  static void GetStart(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());

    Nan::Maybe<MarkerId> id = MarkerIdFromJS(Nan::To<Integer>(info[0]));
    if (id.IsJust()) {
      Point result = wrapper->marker_index.GetStart(id.FromJust());
      info.GetReturnValue().Set(PointToJS(result));
    }
  }

  static void GetEnd(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());

    Nan::Maybe<MarkerId> id = MarkerIdFromJS(Nan::To<Integer>(info[0]));
    if (id.IsJust()) {
      Point result = wrapper->marker_index.GetEnd(id.FromJust());
      info.GetReturnValue().Set(PointToJS(result));
    }
  }

  static void Compare(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());
    Nan::Maybe<MarkerId> id1 = MarkerIdFromJS(Nan::To<Integer>(info[0]));
    Nan::Maybe<MarkerId> id2 = MarkerIdFromJS(Nan::To<Integer>(info[1]));
    if (id1.IsJust() && id2.IsJust()) {
      info.GetReturnValue().Set(wrapper->marker_index.Compare(id1.FromJust(), id2.FromJust()));
    }
  }

  static void FindIntersecting(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());

    Nan::Maybe<Point> start = PointFromJS(Nan::To<Object>(info[0]));
    Nan::Maybe<Point> end = PointFromJS(Nan::To<Object>(info[1]));

    if (start.IsJust() && end.IsJust()) {
      unordered_set<MarkerId> result = wrapper->marker_index.FindIntersecting(start.FromJust(), end.FromJust());
      info.GetReturnValue().Set(MarkerIdsToJS(result));
    }
  }

  static void FindContaining(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());

    Nan::Maybe<Point> start = PointFromJS(Nan::To<Object>(info[0]));
    Nan::Maybe<Point> end = PointFromJS(Nan::To<Object>(info[1]));

    if (start.IsJust() && end.IsJust()) {
      unordered_set<MarkerId> result = wrapper->marker_index.FindContaining(start.FromJust(), end.FromJust());
      info.GetReturnValue().Set(MarkerIdsToJS(result));
    }
  }

  static void FindContainedIn(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());

    Nan::Maybe<Point> start = PointFromJS(Nan::To<Object>(info[0]));
    Nan::Maybe<Point> end = PointFromJS(Nan::To<Object>(info[1]));

    if (start.IsJust() && end.IsJust()) {
      unordered_set<MarkerId> result = wrapper->marker_index.FindContainedIn(start.FromJust(), end.FromJust());
      info.GetReturnValue().Set(MarkerIdsToJS(result));
    }
  }

  static void FindStartingIn(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());

    Nan::Maybe<Point> start = PointFromJS(Nan::To<Object>(info[0]));
    Nan::Maybe<Point> end = PointFromJS(Nan::To<Object>(info[1]));

    if (start.IsJust() && end.IsJust()) {
      unordered_set<MarkerId> result = wrapper->marker_index.FindStartingIn(start.FromJust(), end.FromJust());
      info.GetReturnValue().Set(MarkerIdsToJS(result));
    }
  }

  static void FindEndingIn(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());

    Nan::Maybe<Point> start = PointFromJS(Nan::To<Object>(info[0]));
    Nan::Maybe<Point> end = PointFromJS(Nan::To<Object>(info[1]));

    if (start.IsJust() && end.IsJust()) {
      unordered_set<MarkerId> result = wrapper->marker_index.FindEndingIn(start.FromJust(), end.FromJust());
      info.GetReturnValue().Set(MarkerIdsToJS(result));
    }
  }

  static void Dump(const Nan::FunctionCallbackInfo<Value> &info) {
    MarkerIndexWrapper *wrapper = Nan::ObjectWrap::Unwrap<MarkerIndexWrapper>(info.This());
    unordered_map<MarkerId, Range> snapshot = wrapper->marker_index.Dump();
    info.GetReturnValue().Set(SnapshotToJS(snapshot));
  }

  MarkerIndexWrapper(v8::Local<v8::Number> seed) :
    marker_index{static_cast<unsigned>(seed->Int32Value(Isolate::GetCurrent()->GetCurrentContext()).FromJust())} {}

  MarkerIndex marker_index;
};

Nan::Persistent<Object> MarkerIndexWrapper::is_finite_function;
Nan::Persistent<Object> MarkerIndexWrapper::set_constructor;
Nan::Persistent<Object> MarkerIndexWrapper::set_add_method;
Nan::Persistent<String> MarkerIndexWrapper::row_string;
Nan::Persistent<String> MarkerIndexWrapper::column_string;
Nan::Persistent<String> MarkerIndexWrapper::start_string;
Nan::Persistent<String> MarkerIndexWrapper::end_string;
Nan::Persistent<String> MarkerIndexWrapper::touch_string;
Nan::Persistent<String> MarkerIndexWrapper::inside_string;
Nan::Persistent<String> MarkerIndexWrapper::overlap_string;
Nan::Persistent<String> MarkerIndexWrapper::surround_string;

NODE_MODULE(marker_index, MarkerIndexWrapper::Init)
